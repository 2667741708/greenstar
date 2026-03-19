import { useState, useEffect } from 'react';

export type UserTier = 'plus' | 'pro' | 'ultra';

export const useUserTier = () => {
  const [tier, setTierState] = useState<UserTier>(() => {
    return (localStorage.getItem('greenstar_user_tier') as UserTier) || 'plus';
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'greenstar_user_tier') {
        setTierState((e.newValue as UserTier) || 'plus');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Custom event for same-tab updates
    const handleCustomChange = (e: CustomEvent) => {
      setTierState(e.detail);
    };
    window.addEventListener('greenstar_tier_change', handleCustomChange as EventListener);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('greenstar_tier_change', handleCustomChange as EventListener);
    };
  }, []);

  const setTier = (newTier: UserTier) => {
    localStorage.setItem('greenstar_user_tier', newTier);
    setTierState(newTier);
    window.dispatchEvent(new CustomEvent('greenstar_tier_change', { detail: newTier }));
  };

  return { tier, setTier };
};
