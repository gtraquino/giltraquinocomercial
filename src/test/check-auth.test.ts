import { describe, it } from 'vitest';
import { supabase } from '../integrations/supabase/client';

describe('auth check', () => {
  it('should try signing in', async () => {
    const email = 'g.traquino66@gmail.com';
    const passwords = ['Naosei123!', 'Naosei123', 'Okokokok123!'];
    
    for (const password of passwords) {
      console.log(`Trying to sign in with ${email} / ${password}...`);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.log(`Sign in failed for ${password}:`, error.message);
      } else {
        console.log(`Sign in succeeded for ${password}!`, data.user?.id);
        break;
      }
    }
  });
});
