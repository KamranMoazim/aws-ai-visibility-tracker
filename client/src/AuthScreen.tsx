import { useState, type FormEvent } from 'react';
import { signIn, type Session } from './auth';
import { useAction } from './useAction';

export function AuthScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => onSignedIn(await signIn(email.trim(), password)));
  }

  return (
    <div className="auth">
      <div className="auth-intro">
        <p className="wordmark large">
          Answer<span>Share</span>
        </p>
        <p className="auth-lede">
          See which brands AI answers name for the questions your buyers ask, and which pages they
          trust.
        </p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
        <p className="hint">Accounts are created by the owner with npm run add-user.</p>
      </form>
    </div>
  );
}
