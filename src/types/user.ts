// User type definitions
export interface User {
  id: number;
  username: string;
  email: string;
  password?: string; // Only included when needed, usually excluded from responses
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  date_of_birth?: string;
  role: UserRole;
  is_logged_in: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  access_token?: string;
  access_token_expires_at?: string;
  refresh_token?: string;
  refresh_token_expires_at?: string;
}

export type UserRole = 'user' | 'admin' | 'moderator' | 'vendor';

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  date_of_birth?: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  date_of_birth?: string;
  role?: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: UserRole;
  };
}

export interface PaginatedUsersResponse {
  users: User[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalUsers: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
