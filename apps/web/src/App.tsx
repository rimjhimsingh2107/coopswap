import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { NotFound, RouteError } from '@/components/ErrorBoundary';
import { PageSpinner } from '@/components/ui/Spinner';
import Landing from '@/pages/Landing';

// heavier pages (map, forms) are split out of the main bundle
const Explore = lazy(() => import('@/pages/Explore'));
const ListingDetail = lazy(() => import('@/pages/ListingDetail'));
const CreateListing = lazy(() => import('@/pages/listings/CreateListing'));
const EditListing = lazy(() => import('@/pages/listings/EditListing'));
const Messages = lazy(() => import('@/pages/Messages'));
const Bookings = lazy(() => import('@/pages/Bookings'));
const Profile = lazy(() => import('@/pages/Profile'));
const PublicProfile = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.PublicProfile })));
const Settings = lazy(() => import('@/pages/Settings'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const SignIn = lazy(() => import('@/pages/auth/SignIn'));
const SignUp = lazy(() => import('@/pages/auth/SignUp'));
const VerifyEmail = lazy(() => import('@/pages/auth/TokenPages').then((m) => ({ default: m.VerifyEmail })));
const VerifyUniversity = lazy(() => import('@/pages/auth/TokenPages').then((m) => ({ default: m.VerifyUniversity })));
const ForgotPassword = lazy(() => import('@/pages/auth/TokenPages').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('@/pages/auth/TokenPages').then((m) => ({ default: m.ResetPassword })));
const Admin = lazy(() => import('@/pages/Admin'));

const page = (el: ReactNode) => <Suspense fallback={<PageSpinner />}>{el}</Suspense>;
const priv = (el: ReactNode) => page(<RequireAuth>{el}</RequireAuth>);

export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/explore', element: page(<Explore />) },
      { path: '/listings/new', element: priv(<CreateListing />) },
      { path: '/listings/:id', element: page(<ListingDetail />) },
      { path: '/listings/:id/edit', element: priv(<EditListing />) },
      { path: '/messages', element: priv(<Messages />) },
      { path: '/messages/:id', element: priv(<Messages />) },
      { path: '/bookings', element: priv(<Bookings />) },
      { path: '/profile', element: priv(<Profile />) },
      { path: '/users/:id', element: page(<PublicProfile />) },
      { path: '/settings', element: priv(<Settings />) },
      { path: '/notifications', element: priv(<Notifications />) },
      { path: '/admin', element: priv(<Admin />) },
      { path: '/signin', element: page(<SignIn />) },
      { path: '/signup', element: page(<SignUp />) },
      { path: '/verify-email', element: page(<VerifyEmail />) },
      { path: '/verify-university', element: priv(<VerifyUniversity />) },
      { path: '/forgot-password', element: page(<ForgotPassword />) },
      { path: '/reset-password', element: page(<ResetPassword />) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
