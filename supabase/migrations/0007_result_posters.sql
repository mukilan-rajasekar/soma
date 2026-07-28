-- 0007_result_posters.sql — let the runner store the posters it already produces.
--
-- FOUND BY RUNNING THE LOOP, not by reading it. The `uploads` bucket was created for
-- customer intake, so its MIME allowlist is video-only. But stage 7 of
-- tools/concierge/run_batch.py uploads BOTH artifacts the scorer writes — the web
-- transcode (.mp4) and the poster frame (.jpg) — under results/<batch_id>/. Storage
-- answered the poster with:
--
--     415 invalid_mime_type: mime type image/jpeg is not supported
--
-- which means every real batch would have died at the upload stage, immediately AFTER
-- the GPU work that costs money and minutes, and immediately BEFORE the customer got
-- anything. The run would be marked failed with all the expensive work already paid for.
--
-- WHY WIDEN THIS BUCKET RATHER THAN ADD A SECOND ONE. The tight MIME list here was never
-- what stops someone uploading a non-video: /api/uploads/sign validates the content type
-- server-side and only it can mint a signed upload URL, and a write under queued/ is
-- impossible without one. The bucket list is defence in depth behind that check, and
-- adding image/jpeg to it does not weaken the check. A separate results bucket would buy
-- a cleaner retention story and cost a second signing path in /r/<token>; if result
-- retention ever needs to differ from footage retention, that is the moment to split it.
--
-- Idempotent. Safe to run repeatedly. Already applied to the live project.

update storage.buckets
   set allowed_mime_types = array[
         -- intake: what a customer may upload
         'video/mp4',
         'video/quicktime',
         'video/webm',
         'video/x-msvideo',
         'video/x-matroska',
         -- output: what the runner writes under results/<batch_id>/
         'image/jpeg',
         'image/png',
         'image/webp'
       ]
 where id = 'uploads';
