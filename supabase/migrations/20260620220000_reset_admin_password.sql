-- Reset password for g.traquino66@gmail.com to Okokokok123!
UPDATE auth.users
SET encrypted_password = crypt('Okokokok123!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'g.traquino66@gmail.com';
