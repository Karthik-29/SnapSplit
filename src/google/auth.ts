export type GoogleUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

export async function mockSignIn(): Promise<GoogleUser> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({
        id: 'google-user-1',
        name: 'Karthik',
        email: 'karthik@example.com',
        avatarUrl: 'https://www.gravatar.com/avatar/?d=identicon',
      });
    }, 250);
  });
}

export async function mockSignOut(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 150));
}
