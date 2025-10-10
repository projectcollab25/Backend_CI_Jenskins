-- Insert sample users
INSERT INTO users (email, name, hashed_password, role)
VALUES
  ('alice@example.com', 'Alice', 'hashed_pw_1','user'),
  ('bob@example.com', 'test', '$2a$10$kZk1z1iwI3l5TFyqxDIAKeOEqaXWwwxqLcDS/0uyLZo/Tl/90S0ui','user'),
  ('mohamed','mohamed','$2a$10$hpqgWXHwuuHi8Xac5NciV.KK2iYUjknrrz3katnm0SiqyY4MuUSjm','admin');
  


-- Insert sample rooms
INSERT INTO rooms (name, capacity, description)
VALUES
  ('Conference A', 10, 'First floor conference room'),
  ('Meeting B', 4, 'Small meeting room');

-- Insert sample bookings
INSERT INTO bookings (room_id, user_id, start_time, end_time, status, notes)
VALUES
  (1, 1, now() + interval '1 day', now() + interval '1 day' + interval '1 hour', 'confirmed', 'Team sync'),
  (2, 2, now() + interval '2 days', now() + interval '2 days' + interval '30 minutes', 'pending', 'Client call');
