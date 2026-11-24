-- A comment thread can be on an OBJECT of the slide (a picture, a chart): its pin follows the object; x/y stay as the place it was, for when the object is removed.
ALTER TABLE "comment_thread" ADD COLUMN IF NOT EXISTS "element_id" text;
