BEGIN;

-- Secure Chat Storage RLS Policies
-- Enforces that only chat participants or service_role can read, upload, or delete chat files.
-- Path layout: chat/{chat_id}/{type}/{timestamp}-{filename}

DROP POLICY IF EXISTS "Allow users to read chat files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own chat files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload chat files" ON storage.objects;
DROP POLICY IF EXISTS "Allow chat participants to read chat files" ON storage.objects;
DROP POLICY IF EXISTS "Allow chat participants to upload chat files" ON storage.objects;
DROP POLICY IF EXISTS "Allow chat participants to delete chat files" ON storage.objects;

-- Read policy: only participants in the specified chat can read files
CREATE POLICY "Allow chat participants to read chat files"
ON storage.objects
FOR SELECT
USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name LIKE 'chat%')
    AND (
        auth.jwt() ->> 'role' = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM public.chats c
            JOIN public.users u ON u.auth_id = auth.uid()
            WHERE c.id::text = split_part(storage.objects.name, '/', 2)
              AND (c.participant_1_id = u.id OR c.participant_2_id = u.id)
        )
    )
);

-- Upload policy: only participants in the chat can upload files
CREATE POLICY "Allow chat participants to upload chat files"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name LIKE 'chat%')
    AND (
        auth.jwt() ->> 'role' = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM public.chats c
            JOIN public.users u ON u.auth_id = auth.uid()
            WHERE c.id::text = split_part(storage.objects.name, '/', 2)
              AND (c.participant_1_id = u.id OR c.participant_2_id = u.id)
        )
    )
);

-- Delete policy: only participants in the chat can delete files
CREATE POLICY "Allow chat participants to delete chat files"
ON storage.objects
FOR DELETE
USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name LIKE 'chat%')
    AND (
        auth.jwt() ->> 'role' = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM public.chats c
            JOIN public.users u ON u.auth_id = auth.uid()
            WHERE c.id::text = split_part(storage.objects.name, '/', 2)
              AND (c.participant_1_id = u.id OR c.participant_2_id = u.id)
        )
    )
);

COMMIT;
