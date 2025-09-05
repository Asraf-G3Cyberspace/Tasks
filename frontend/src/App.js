import React, { useEffect, useState } from 'react';
import './App.css';
import { AuthApi, getTokens, clearTokens } from './api';

function RegisterForm({ onRegistered }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', first_name: '', last_name: '', phone_number: '', date_of_birth: '' });
  const [msg, setMsg] = useState('');

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!form.username || !form.email || !form.password) {
      setMsg('Username, Email and Password are required.');
      return;
    }
    try {
      await AuthApi.register(form);
      setMsg('Registered successfully. Please log in.');
      setForm({ username: '', email: '', password: '', first_name: '', last_name: '', phone_number: '', date_of_birth: '' });
      onRegistered?.();
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="card">
      <h2>Register</h2>
      <form onSubmit={onSubmit} className="form">
        <input name="username" placeholder="Username" value={form.username} onChange={onChange} />
        <input name="email" type="email" placeholder="Email" value={form.email} onChange={onChange} />
        <input name="password" type="password" placeholder="Password" value={form.password} onChange={onChange} />
        <input name="first_name" placeholder="First Name" value={form.first_name} onChange={onChange} />
        <input name="last_name" placeholder="Last Name" value={form.last_name} onChange={onChange} />
        <input name="phone_number" placeholder="Phone Number" value={form.phone_number} onChange={onChange} />
        <input name="date_of_birth" type="date" placeholder="Date of Birth" value={form.date_of_birth} onChange={onChange} />
        <button type="submit">Register</button>
      </form>
      {msg && <p className="message">{msg}</p>}
    </div>
  );
}

function LoginForm({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [showForce, setShowForce] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setShowForce(false);
    if (!email || !password) { setMsg('Email and password are required.'); return; }
    try {
      const data = await AuthApi.login({ email, password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      onLoggedIn?.();
    } catch (e) {
      if (e.message.includes('already in use')) {
        setMsg('Account in use. Force logout other session?');
        setShowForce(true);
      } else {
        setMsg(e.message);
      }
    }
  };

  const onForce = async () => {
    try {
      await AuthApi.forceLogout(email);
      setMsg('Previous session logged out. Try login again.');
      setShowForce(false);
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="card">
      <h2>Login</h2>
      <form onSubmit={onSubmit} className="form">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Login</button>
      </form>
      {showForce && <button onClick={onForce}>Force Logout Previous Session</button>}
      {msg && <p className="message">{msg}</p>}
    </div>
  );
}

function Dashboard({ onLoggedOut }) {
  const [profile, setProfile] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone_number: '', date_of_birth: '' });
  const [msg, setMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');

  const load = async () => {
    try {
      const p = await AuthApi.profile();
      setProfile(p);
      setForm({
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        phone_number: p.phone_number || '',
        date_of_birth: p.date_of_birth ? p.date_of_birth.split('T')[0] : '',
      });
    } catch (e) {
      setMsg(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const onLogout = async () => {
    try {
      await AuthApi.logout();
    } catch {}
    clearTokens();
    onLoggedOut?.();
  };

  const onSave = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await AuthApi.updateProfile(form);
      setMsg('Profile updated.');
      setEdit(false);
      await load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const onTest = async () => {
    setTestMsg('');
    try {
      const res = await AuthApi.testProtected();
      setTestMsg(res.message);
    } catch (e) {
      setTestMsg(e.message);
    }
  };

  if (!profile) return <p>Loading...</p>;

  return (
    <div className="card">
      <h2>Welcome, {profile.username}</h2>
      <button onClick={onLogout}>Logout</button>

      {!edit && (
        <div>
          <h3>Your Profile</h3>
          <p><b>ID:</b> {profile.id}</p>
          <p><b>Username:</b> {profile.username}</p>
          <p><b>Email:</b> {profile.email}</p>
          <p><b>First Name:</b> {profile.first_name || 'N/A'}</p>
          <p><b>Last Name:</b> {profile.last_name || 'N/A'}</p>
          <p><b>Phone:</b> {profile.phone_number || 'N/A'}</p>
          <p><b>DOB:</b> {profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : 'N/A'}</p>
          <button onClick={() => setEdit(true)}>Edit Profile</button>
        </div>
      )}

      {edit && (
        <form onSubmit={onSave} className="form">
          <input placeholder="First Name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input placeholder="Last Name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <input placeholder="Phone" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
          <input type="date" placeholder="DOB" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          <div>
            <button type="submit">Save</button>
            <button type="button" onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </form>
      )}

      {msg && <p className="message">{msg}</p>}

      <h3>Test Protected Route</h3>
      <button onClick={onTest}>Test Protected</button>
      {testMsg && <p className="message">{testMsg}</p>}
    </div>
  );
}

function App() {
  const [{ accessToken }] = useState(getTokens());
  const [isAuthed, setIsAuthed] = useState(!!accessToken);

  const getInitialTheme = () => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  };
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const onStorage = () => setIsAuthed(!!localStorage.getItem('accessToken'));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="container">
      <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginBottom: 12}}>
        <h1 style={{margin: 0}}>Authentication App</h1>
        <button
          className="secondary"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>

      {!isAuthed ? (
        <>
          <RegisterForm onRegistered={() => {}} />
          <LoginForm onLoggedIn={() => setIsAuthed(true)} />
        </>
      ) : (
        <Dashboard onLoggedOut={() => setIsAuthed(false)} />)
      }
    </div>
  );
}

export default App;
