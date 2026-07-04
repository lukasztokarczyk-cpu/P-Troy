import { redirect } from 'next/navigation';

// Strona główna ("/") sama w sobie nie renderuje niczego — przekierowuje
// od razu na /login. AuthProvider w tamtej trasie sam sprawdzi, czy
// użytkownik ma już aktywną sesję (ciasteczko refresh token) i jeśli tak,
// przeniesie go dalej do /dashboard automatycznie.
export default function RootPage() {
  redirect('/login');
}