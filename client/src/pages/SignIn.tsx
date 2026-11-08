import { useState, type FormEvent } from 'react';
import { Wordmark } from '../app/Brand';
import { ErrorText } from '../components/Feedback';
import { signIn, type Session } from '../lib/auth';
import { useAction } from '../lib/hooks/useAction';

export function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => onSignedIn(await signIn(email.trim(), password)));
  }

  return (
    <div className="signin">
      <section className="signin-story">
        <Wordmark large />
        <blockquote className="signin-quote">
          <p>
            For invoicing international clients, <mark className="brand-competitor">Wise</mark> and{' '}
            <mark className="brand-competitor">Payoneer</mark> are the usual picks.{' '}
            <mark className="brand-own">Your brand</mark> belongs in that sentence.
          </p>
          <footer>
            See which brands AI answers name for your buyers' questions, and which pages they trust.
          </footer>
        </blockquote>
      </section>
      <form className="signin-form" onSubmit={submit}>
        <h1>Sign in</h1>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <ErrorText message={error} />
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
        <p className="hint">
          Accounts are created by the owner with <code>npm run add-user</code>.
        </p>
      </form>
    </div>
  );
}
