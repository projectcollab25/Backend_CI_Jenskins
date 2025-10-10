-- Add or alter status default for bookings
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';
-- Ensure status column exists (if not created earlier)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='status') THEN
    ALTER TABLE bookings ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
  END IF;
END$$;
