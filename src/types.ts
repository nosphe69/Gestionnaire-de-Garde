export interface User {
  id: number;
  username: string;
  code: string;
  name: string;
  email?: string;
  is_admin?: number;
}

export interface Shift {
  id: number;
  user_id: number;
  date: string;
  emergencies: number;
  bonus_amount: number;
  user_name?: string;
  user_code?: string;
}
