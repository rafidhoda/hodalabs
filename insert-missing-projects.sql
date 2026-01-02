-- Insert missing projects from CSV import
INSERT INTO projects (name, description, status) VALUES
  ('Oslo Winter Break Roblox Camp 2026', NULL, 'active'),
  ('Abu Dhabi Roblox Weekend Camp 2025', NULL, 'completed'),
  ('Testing', NULL, 'active'),
  ('App Development', NULL, 'active')
ON CONFLICT DO NOTHING;


