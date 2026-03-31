import { setupChatStorage } from '../src/services/chat/storage.setup';

async function main() {
  console.log('Starting chat storage setup...');
  
  const result = await setupChatStorage();
  
  if (result.success) {
    console.log('✓ Chat bucket created successfully:', result.bucketId);
    process.exit(0);
  } else {
    console.error('✗ Failed to create chat bucket:', result.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
