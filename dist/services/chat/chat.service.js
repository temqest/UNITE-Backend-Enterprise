"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatService = exports.ChatService = void 0;
const supabase_client_1 = require("../../lib/supabase/supabase.client");
const types_1 = require("./types");
const access_service_1 = require("./access.service");
/**
 * Chat service for managing conversation threads
 * Handles creation, retrieval, and real-time subscriptions
 */
class ChatService {
    supabase;
    activeSubscriptions = new Map();
    constructor(supabase = supabase_client_1.supabaseServer) {
        this.supabase = supabase;
    }
    /**
     * Create a new chat between two participants
     * Validates that both participants exist and can communicate
     */
    async createChat(input) {
        const parsed = types_1.ChatCreateInputSchema.safeParse(input);
        if (!parsed.success) {
            return {
                data: null,
                error: (0, types_1.toServiceError)('CHAT_VALIDATION_FAILED', 'Invalid chat input', parsed.error.issues),
            };
        }
        const chatInput = parsed.data;
        try {
            // Validate that both participants exist and are in the same org
            const validateResult = await access_service_1.accessService.validateChatParticipants(chatInput.org_id, chatInput.participant_1_id, chatInput.participant_2_id);
            if (validateResult.error || !validateResult.data) {
                return {
                    data: null,
                    error: validateResult.error || (0, types_1.toServiceError)('PARTICIPANT_VALIDATION_FAILED', 'Participant validation failed'),
                };
            }
            // Check if users can actually chat based on geo/role rules
            const canChatResult = await access_service_1.accessService.canUserChat(chatInput.participant_1_id, chatInput.participant_2_id);
            if (canChatResult.error || !canChatResult.data) {
                return {
                    data: null,
                    error: canChatResult.error || (0, types_1.toServiceError)('CHAT_NOT_ALLOWED', 'Users cannot chat with each other based on current policies'),
                };
            }
            // Check if chat already exists (normalized - order doesn't matter)
            const { data: existingChat } = await this.supabase.rpc('find_or_create_chat', {
                p_org_id: chatInput.org_id,
                p_participant_1_id: chatInput.participant_1_id,
                p_participant_2_id: chatInput.participant_2_id,
            });
            if (existingChat) {
                return { data: existingChat, error: null };
            }
            // Create new chat
            const { data: chatData, error: insertError } = await this.supabase
                .from('chats')
                .insert([
                {
                    org_id: chatInput.org_id,
                    participant_1_id: chatInput.participant_1_id,
                    participant_2_id: chatInput.participant_2_id,
                    media_summary: {
                        images: [],
                        videos: [],
                        files: [],
                        links: [],
                    },
                },
            ])
                .select()
                .single();
            if (insertError) {
                // Check if duplicate error (already exists)
                if (insertError.code === '23505') {
                    return {
                        data: null,
                        error: (0, types_1.toServiceError)('CHAT_ALREADY_EXISTS', 'Chat between these participants already exists'),
                    };
                }
                return {
                    data: null,
                    error: (0, types_1.toServiceError)('CHAT_CREATE_FAILED', `Failed to create chat: ${insertError.message}`, insertError),
                };
            }
            return { data: chatData, error: null };
        }
        catch (err) {
            return {
                data: null,
                error: (0, types_1.toServiceError)('CHAT_CREATE_ERROR', 'Unexpected error creating chat', err),
            };
        }
    }
    /**
     * Get all chats for a user with metadata
     * Returns chats where user is a participant
     */
    async getChatList(userId, orgId, options) {
        try {
            const limit = options?.limit ?? 50;
            const offset = options?.offset ?? 0;
            const includeMetadata = options?.includeMetadata ?? true;
            let query = this.supabase
                .from('chats')
                .select(`
          id,
          org_id,
          participant_1_id,
          participant_2_id,
          media_summary,
          created_at,
          updated_at
        `)
                .eq('org_id', orgId)
                .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`)
                .order('updated_at', { ascending: false })
                .range(offset, offset + limit - 1);
            const { data: chats, error } = await query;
            if (error) {
                return {
                    data: null,
                    error: (0, types_1.toServiceError)('CHATS_FETCH_FAILED', `Failed to fetch chats: ${error.message}`, error),
                };
            }
            if (!chats || chats.length === 0) {
                return { data: [], error: null };
            }
            // If metadata not needed, return as-is
            if (!includeMetadata) {
                return { data: chats || [], error: null };
            }
            // Enrich with metadata
            const enrichedChats = await Promise.all(chats.map(async (chat) => {
                const result = await this.enrichChatWithMetadata(chat, userId);
                return result || chat;
            }));
            return { data: enrichedChats, error: null };
        }
        catch (err) {
            return {
                data: null,
                error: (0, types_1.toServiceError)('CHATS_FETCH_ERROR', 'Unexpected error fetching chats', err),
            };
        }
    }
    /**
     * Get a single chat by ID with metadata
     */
    async getChat(chatId, userId) {
        try {
            // Validate user has access
            const accessCheck = await access_service_1.accessService.validateChatAccess(chatId, userId);
            if (accessCheck.error || !accessCheck.data) {
                return {
                    data: null,
                    error: accessCheck.error || (0, types_1.toServiceError)('ACCESS_DENIED', 'User does not have access to this chat'),
                };
            }
            const { data: chatData, error } = await this.supabase.from('chats').select('*').eq('id', chatId).single();
            if (error) {
                return {
                    data: null,
                    error: (0, types_1.toServiceError)('CHAT_FETCH_FAILED', `Failed to fetch chat: ${error.message}`, error),
                };
            }
            if (!chatData) {
                return {
                    data: null,
                    error: (0, types_1.toServiceError)('CHAT_NOT_FOUND', `Chat not found: ${chatId}`),
                };
            }
            // Enrich with metadata
            const enriched = await this.enrichChatWithMetadata(chatData, userId);
            return { data: enriched || chatData, error: null };
        }
        catch (err) {
            return {
                data: null,
                error: (0, types_1.toServiceError)('CHAT_FETCH_ERROR', 'Unexpected error fetching chat', err),
            };
        }
    }
    /**
     * Subscribe to real-time updates for a chat
     * Listen to new messages, updates, and deletions
     */
    async subscribeToChatUpdates(chatId, userId, handlers) {
        try {
            // Validate user has access to chat
            const accessCheck = await access_service_1.accessService.validateChatAccess(chatId, userId);
            if (accessCheck.error || !accessCheck.data) {
                return {
                    data: null,
                    error: accessCheck.error || (0, types_1.toServiceError)('ACCESS_DENIED', 'User does not have access to this chat'),
                };
            }
            // Check if already subscribed
            if (this.activeSubscriptions.has(chatId)) {
                const existing = this.activeSubscriptions.get(chatId);
                if (existing) {
                    // Update handlers
                    existing.handlers = handlers;
                    return {
                        data: {
                            unsubscribe: async () => {
                                await this.unsubscribeFromChat(chatId);
                            },
                        },
                        error: null,
                    };
                }
            }
            // Create new subscription channel
            const channel = this.supabase
                .channel(`chat:${chatId}`, {
                config: {
                    broadcast: { self: false },
                    presence: { key: userId },
                },
            })
                .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `chat_id=eq.${chatId}`,
            }, async (payload) => {
                if (handlers.onMessageInsert) {
                    try {
                        await handlers.onMessageInsert(payload.new);
                    }
                    catch (err) {
                        if (handlers.onError) {
                            handlers.onError((0, types_1.toServiceError)('HANDLER_ERROR', 'Error in onMessageInsert handler', err));
                        }
                    }
                }
            })
                .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `chat_id=eq.${chatId}`,
            }, async (payload) => {
                if (handlers.onMessageUpdate) {
                    try {
                        await handlers.onMessageUpdate(payload.new);
                    }
                    catch (err) {
                        if (handlers.onError) {
                            handlers.onError((0, types_1.toServiceError)('HANDLER_ERROR', 'Error in onMessageUpdate handler', err));
                        }
                    }
                }
            })
                .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'messages',
                filter: `chat_id=eq.${chatId}`,
            }, async (payload) => {
                if (handlers.onMessageDelete) {
                    try {
                        const messageId = payload.old.id;
                        await handlers.onMessageDelete(messageId);
                    }
                    catch (err) {
                        if (handlers.onError) {
                            handlers.onError((0, types_1.toServiceError)('HANDLER_ERROR', 'Error in onMessageDelete handler', err));
                        }
                    }
                }
            })
                .subscribe();
            // Store subscription
            this.activeSubscriptions.set(chatId, {
                channel,
                handlers,
                chatId,
            });
            return {
                data: {
                    unsubscribe: async () => {
                        await this.unsubscribeFromChat(chatId);
                    },
                },
                error: null,
            };
        }
        catch (err) {
            return {
                data: null,
                error: (0, types_1.toServiceError)('SUBSCRIPTION_ERROR', 'Unexpected error subscribing to chat', err),
            };
        }
    }
    /**
     * Unsubscribe from chat updates
     */
    async unsubscribeFromChat(chatId) {
        try {
            const subscription = this.activeSubscriptions.get(chatId);
            if (!subscription) {
                return { data: false, error: null };
            }
            await this.supabase.removeChannel(subscription.channel);
            this.activeSubscriptions.delete(chatId);
            return { data: true, error: null };
        }
        catch (err) {
            return {
                data: false,
                error: (0, types_1.toServiceError)('UNSUBSCRIBE_ERROR', 'Unexpected error unsubscribing from chat', err),
            };
        }
    }
    /**
     * Unsubscribe from all active chat subscriptions
     */
    async unsubscribeFromAllChats() {
        try {
            const chatIds = Array.from(this.activeSubscriptions.keys());
            await Promise.all(chatIds.map((chatId) => this.unsubscribeFromChat(chatId)));
            return { data: true, error: null };
        }
        catch (err) {
            return {
                data: false,
                error: (0, types_1.toServiceError)('UNSUBSCRIBE_ALL_ERROR', 'Unexpected error unsubscribing from all chats', err),
            };
        }
    }
    /**
     * Broadcast a message via Realtime (for sending to other clients)
     */
    async broadcastMessage(chatId, message) {
        try {
            const subscription = this.activeSubscriptions.get(chatId);
            if (!subscription) {
                return {
                    data: false,
                    error: (0, types_1.toServiceError)('NOT_SUBSCRIBED', `Not subscribed to chat: ${chatId}`),
                };
            }
            await subscription.channel.send({
                type: 'broadcast',
                event: 'message',
                payload: message,
            });
            return { data: true, error: null };
        }
        catch (err) {
            return {
                data: false,
                error: (0, types_1.toServiceError)('BROADCAST_ERROR', 'Unexpected error broadcasting message', err),
            };
        }
    }
    /**
     * Enrich chat with metadata (unread count, last message, other participant)
     */
    async enrichChatWithMetadata(chat, currentUserId) {
        try {
            // Get unread count
            const { count: unreadCount } = await this.supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('chat_id', chat.id)
                .eq('is_read', false);
            // Get last message
            const { data: lastMessageData } = await this.supabase
                .from('messages')
                .select('*')
                .eq('chat_id', chat.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            // Get other participant info
            const otherParticipantId = currentUserId === chat.participant_1_id ? chat.participant_2_id : chat.participant_1_id;
            const { data: otherParticipant } = await this.supabase
                .from('users')
                .select('id, email, first_name, last_name')
                .eq('id', otherParticipantId)
                .single();
            return {
                ...chat,
                unread_count: unreadCount || 0,
                last_message: lastMessageData,
                other_participant: otherParticipant
                    ? {
                        id: otherParticipant.id || '',
                        email: otherParticipant.email || '',
                        full_name: `${otherParticipant.first_name || ''} ${otherParticipant.last_name || ''}`.trim(),
                    }
                    : undefined,
            };
        }
        catch (err) {
            console.error('[chat] Failed to enrich chat metadata:', err);
            return null;
        }
    }
}
exports.ChatService = ChatService;
/**
 * Singleton instance
 */
exports.chatService = new ChatService();
