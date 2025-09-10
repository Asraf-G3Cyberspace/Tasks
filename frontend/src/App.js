import React, { useEffect, useState } from 'react';
import './App.css';
import { AuthApi, getTokens, clearTokens } from './api';

function AuthForm({ onLoggedIn }) {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ 
    username: '', 
    email: '', 
    password: '', 
    first_name: '', 
    last_name: '', 
    phone_number: '', 
    date_of_birth: '', 
    role: 'user' 
  });
  const [msg, setMsg] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setShowConfirmDialog(false);
    setPendingCredentials(null);

    if (isLogin) {
      if (!form.email || !form.password) {
        setMsg('Email and password are required.');
        return;
      }
      try {
        const data = await AuthApi.login({ email: form.email, password: form.password });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        onLoggedIn?.();
      } catch (e) {
        if (e.message.includes('already logged in')) {
          setPendingCredentials({ email: form.email, password: form.password });
          setShowConfirmDialog(true);
        } else {
          setMsg(e.message);
        }
      }
    } else {
      if (!form.username || !form.email || !form.password || !form.role) {
        setMsg('Username, Email, Password, and Role are required.');
      return;
    }
    try {
      await AuthApi.register(form);
      setMsg('Registered successfully. Please log in.');
        setForm({ 
          username: '', 
          email: '', 
          password: '', 
          first_name: '', 
          last_name: '', 
          phone_number: '', 
          date_of_birth: '', 
          role: 'user' 
        });
        setIsLogin(true);
    } catch (e) {
      setMsg(e.message);
      }
    }
  };

  const handleConfirmLogout = async () => {
    try {
      const data = await AuthApi.confirmLogoutLogin(pendingCredentials);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setShowConfirmDialog(false);
      setPendingCredentials(null);
      onLoggedIn?.();
    } catch (e) {
        setMsg(e.message);
      setShowConfirmDialog(false);
      setPendingCredentials(null);
    }
  };

  const handleCancelLogout = () => {
    setShowConfirmDialog(false);
    setPendingCredentials(null);
    setMsg('Login cancelled.');
  };

  return (
    <div className="card">
      <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
      
      {showConfirmDialog && (
        <div className="confirm-dialog">
          <p>User already logged in on another device. Do you want to continue and logout the other session?</p>
          <div className="dialog-buttons">
            <button onClick={handleConfirmLogout} className="confirm-btn">Yes, Continue</button>
            <button onClick={handleCancelLogout} className="cancel-btn">Cancel</button>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="form">
        {!isLogin && (
          <>
            <div className="form-group">
              <label>Username</label>
              <input name="username" placeholder="Enter username" value={form.username} onChange={onChange} required />
            </div>
            <div className="form-group">
              <label>First Name</label>
              <input name="first_name" placeholder="Enter first name" value={form.first_name} onChange={onChange} />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input name="last_name" placeholder="Enter last name" value={form.last_name} onChange={onChange} />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input name="phone_number" placeholder="Enter phone number" value={form.phone_number} onChange={onChange} />
            </div>
            <div className="form-group">
              <label>Date of Birth</label>
              <input name="date_of_birth" type="date" value={form.date_of_birth} onChange={onChange} />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select name="role" value={form.role} onChange={onChange} required>
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
          </>
        )}
        <div className="form-group">
          <label>Email</label>
          <input name="email" type="email" placeholder="Enter your email" value={form.email} onChange={onChange} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input name="password" type="password" placeholder="Enter your password" value={form.password} onChange={onChange} required />
        </div>
        <button type="submit">{isLogin ? 'Sign In' : 'Create Account'}</button>
      </form>
      
      <p className="toggle-form">
        {isLogin ? (
          <>Don't have an account? <button type="button" onClick={() => setIsLogin(false)} className="link-btn">Sign up</button></>
        ) : (
          <>Already have an account? <button type="button" onClick={() => setIsLogin(true)} className="link-btn">Sign in</button></>
        )}
      </p>
      
      {msg && <p className={`message ${msg.includes('successfully') ? 'success' : 'error'}`}>{msg}</p>}
    </div>
  );
}


function Dashboard({ onLoggedOut }) {
  const [profile, setProfile] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone_number: '', date_of_birth: '' });
  const [msg, setMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('create');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    date_of_birth: '',
    role: 'user'
  });

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

  const loadUsers = async (page = 1, search = '') => {
    try {
      const params = { page, limit: 10 };
      if (search) params.search = search;
      const data = await AuthApi.getUsers(params);
      setUsers(data.users);
      setPagination(data.pagination);
      setCurrentPage(page);
    } catch (e) {
      setMsg(e.message);
    }
  };

  useEffect(() => { 
    load(); 
    if (profile?.role === 'admin' || profile?.role === 'moderator') {
      loadUsers();
    }
  }, [profile?.role]);

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
      setMsg('Profile updated successfully.');
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

  const handleSearch = (e) => {
    e.preventDefault();
    loadUsers(1, searchTerm);
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await AuthApi.deleteUser(userId);
        setMsg('User deleted successfully.');
        loadUsers(currentPage, searchTerm);
      } catch (e) {
        setMsg(e.message);
      }
    }
  };

  const handleCreateUser = () => {
    setModalType('create');
    setUserForm({
      username: '',
      email: '',
      password: '',
      first_name: '',
      last_name: '',
      phone_number: '',
      date_of_birth: '',
      role: 'user'
    });
    setShowModal(true);
  };

  const handleEditUser = (user) => {
    setModalType('edit');
    setSelectedUser(user);
    setUserForm({
      username: user.username,
      email: user.email,
      password: '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone_number: user.phone_number || '',
      date_of_birth: user.date_of_birth ? user.date_of_birth.split('T')[0] : '',
      role: user.role
    });
    setShowModal(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      if (modalType === 'create') {
        await AuthApi.createUser(userForm);
        setMsg('User created successfully.');
      } else {
        await AuthApi.updateUser(selectedUser.id, userForm);
        setMsg('User updated successfully.');
      }
      setShowModal(false);
      loadUsers(currentPage, searchTerm);
    } catch (e) {
      setMsg(e.message);
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'admin': return 'role-admin';
      case 'moderator': return 'role-moderator';
      case 'vendor': return 'role-vendor';
      default: return 'role-user';
    }
  };

  if (!profile) return <div className="loading">Loading...</div>;

  const isAdmin = profile.role === 'admin';
  const isModerator = profile.role === 'moderator' || isAdmin;

  return (
    <div className="card">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <div className="user-info">
          <span className="user-role">{profile.role}</span>
          <button onClick={onLogout} className="logout-btn">Logout</button>
        </div>
      </div>

      <div className="welcome-section">
        <h2>Welcome back, {profile.first_name || profile.username}!</h2>
        <p>Manage your account and {isModerator ? 'users' : 'profile'} from your dashboard.</p>
      </div>

      {msg && <p className={`message ${msg.includes('successfully') ? 'success' : 'error'}`}>{msg}</p>}

      {/* Navigation Tabs */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        {isModerator && (
          <button 
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            User Management
          </button>
        )}
        <button 
          className={`tab-btn ${activeTab === 'test' ? 'active' : ''}`}
          onClick={() => setActiveTab('test')}
        >
          API Test
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="tab-content">
          {!edit ? (
            <div className="profile-grid">
              <div className="profile-card">
                <h3>Personal Information</h3>
                <div className="profile-item">
                  <span className="profile-label">Username</span>
                  <span className="profile-value">{profile.username}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Email</span>
                  <span className="profile-value">{profile.email}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Role</span>
                  <span className={`profile-value role-badge ${getRoleBadgeClass(profile.role)}`}>
                    {profile.role}
                  </span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">First Name</span>
                  <span className="profile-value">{profile.first_name || 'Not set'}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Last Name</span>
                  <span className="profile-value">{profile.last_name || 'Not set'}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Phone</span>
                  <span className="profile-value">{profile.phone_number || 'Not set'}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Date of Birth</span>
                  <span className="profile-value">
                    {profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : 'Not set'}
                  </span>
                </div>
              </div>
              
              <div className="profile-card">
                <h3>Account Information</h3>
                <div className="profile-item">
                  <span className="profile-label">User ID</span>
                  <span className="profile-value">{profile.id}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Created</span>
                  <span className="profile-value">{new Date(profile.created_at).toLocaleDateString()}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Last Login</span>
                  <span className="profile-value">
                    {profile.last_login ? new Date(profile.last_login).toLocaleString() : 'Never'}
                  </span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Status</span>
                  <span className={`profile-value ${profile.is_logged_in ? 'status-online' : 'status-offline'}`}>
                    {profile.is_logged_in ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={onSave} className="form">
              <h3>Edit Profile</h3>
              <div className="form-group">
                <label>First Name</label>
                <input 
                  value={form.first_name} 
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })} 
                  placeholder="Enter first name"
                />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input 
                  value={form.last_name} 
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })} 
                  placeholder="Enter last name"
                />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input 
                  value={form.phone_number} 
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })} 
                  placeholder="Enter phone number"
                />
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <input 
                  type="date" 
                  value={form.date_of_birth} 
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} 
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Save Changes</button>
                <button type="button" onClick={() => setEdit(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          )}

      {!edit && (
            <div className="profile-actions">
              <button onClick={() => setEdit(true)} className="btn-primary">Edit Profile</button>
            </div>
          )}
        </div>
      )}

      {/* User Management Tab */}
      {activeTab === 'users' && isModerator && (
        <div className="tab-content">
          <div className="admin-panel">
            <div className="admin-header">
              <h3 className="admin-title">User Management</h3>
              <div className="admin-actions">
                {isAdmin && (
                  <button onClick={handleCreateUser} className="btn-primary">Create User</button>
                )}
                <button onClick={() => loadUsers(1, '')} className="btn-secondary">Refresh</button>
              </div>
            </div>

            <div className="users-table">
              <div className="table-header">
                <form onSubmit={handleSearch} className="search-form">
                  <input 
                    className="search-input"
                    placeholder="Search users by name, email..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                  />
                  <button type="submit" className="btn-primary">Search</button>
                </form>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>
        <div>
                          <strong>{user.username}</strong>
                          <br />
                          <small>{user.email}</small>
                        </div>
                      </td>
                      <td>
                        <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span className={user.is_logged_in ? 'status-online' : 'status-offline'}>
                          {user.is_logged_in ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>{new Date(user.created_at).toLocaleDateString()}</td>
                      <td>
                        {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => handleEditUser(user)} 
                            className="btn-success"
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button 
                              onClick={() => handleDeleteUser(user.id)} 
                              className="btn-danger"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button 
                  disabled={!pagination.hasPrev} 
                  onClick={() => loadUsers(currentPage - 1, searchTerm)}
                >
                  Previous
                </button>
                <span className="pagination-info">
                  Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalUsers} total users)
                </span>
                <button 
                  disabled={!pagination.hasNext} 
                  onClick={() => loadUsers(currentPage + 1, searchTerm)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* API Test Tab */}
      {activeTab === 'test' && (
        <div className="tab-content">
          <div className="profile-card">
            <h3>API Test</h3>
            <p>Test the protected API endpoint to verify your authentication is working.</p>
            <button onClick={onTest} className="btn-primary">Test Protected Route</button>
            {testMsg && <p className={`message ${testMsg.includes('Welcome') ? 'success' : 'error'}`}>{testMsg}</p>}
          </div>
        </div>
      )}

      {/* User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {modalType === 'create' ? 'Create New User' : 'Edit User'}
              </h3>
              <button onClick={() => setShowModal(false)} className="close-btn">×</button>
            </div>
            
            <form onSubmit={handleSaveUser} className="form">
              <div className="form-group">
                <label>Username</label>
                <input 
                  name="username" 
                  value={userForm.username} 
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input 
                  name="email" 
                  type="email" 
                  value={userForm.email} 
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Password {modalType === 'edit' && '(leave blank to keep current)'}</label>
                <input 
                  name="password" 
                  type="password" 
                  value={userForm.password} 
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} 
                  required={modalType === 'create'}
                />
              </div>
              <div className="form-group">
                <label>First Name</label>
                <input 
                  name="first_name" 
                  value={userForm.first_name} 
                  onChange={(e) => setUserForm({ ...userForm, first_name: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input 
                  name="last_name" 
                  value={userForm.last_name} 
                  onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input 
                  name="phone_number" 
                  value={userForm.phone_number} 
                  onChange={(e) => setUserForm({ ...userForm, phone_number: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <input 
                  name="date_of_birth" 
                  type="date" 
                  value={userForm.date_of_birth} 
                  onChange={(e) => setUserForm({ ...userForm, date_of_birth: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select 
                  name="role" 
                  value={userForm.role} 
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} 
                  required
                >
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="vendor">Vendor</option>
                  {isAdmin && <option value="admin">Admin</option>}
                </select>
              </div>
              
              <div className="modal-actions">
                <button type="submit" className="btn-primary">
                  {modalType === 'create' ? 'Create User' : 'Update User'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
      <div className="header">
        <h1>Authentication System</h1>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </div>

      {!isAuthed ? (
        <AuthForm onLoggedIn={() => setIsAuthed(true)} />
      ) : (
        <Dashboard onLoggedOut={() => setIsAuthed(false)} />
      )}
    </div>
  );
}

export default App;
