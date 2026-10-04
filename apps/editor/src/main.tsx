import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { UpgradeModal } from '@/components/UpgradeModal'
import { EntitlementsProvider } from '@/lib/entitlements'
import { FlagsProvider } from '@/lib/flags'
import { DevGallery } from '@/pages/DevGallery'
import { RequireAuth } from '@/lib/session'
import { HomePage } from '@/pages/HomePage'
import { StartPage } from '@/pages/StartPage'
import { CreatePage } from '@/pages/CreatePage'
import { EditorPage } from '@/pages/EditorPage'
import { BillingPage } from '@/pages/BillingPage'
import { PresentPage } from '@/pages/PresentPage'
import { CreatedPage } from '@/pages/CreatedPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import './index.css'

// Owner dashboard is its own chunk: regular users never download it (the API enforces admin-only regardless).
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const adminView = (name: 'Overview' | 'Tokens' | 'Models' | 'Users' | 'Countries' | 'Errors') => lazy(() => import('@/pages/admin/UsageViews').then((m) => ({ default: m[name] })))
const views = { Overview: adminView('Overview'), Tokens: adminView('Tokens'), Models: adminView('Models'), Users: adminView('Users'), Countries: adminView('Countries'), Errors: adminView('Errors') }

const section = (name: string) => lazy(() => import(`@/pages/admin/sections/${name}.tsx`))
const sections = { sales: section('Sales'), subscriptions: section('Subscriptions'), images: section('Images'), margin: section('Margin'), presentations: section('Presentations'), exports: section('Exports'), prompts: section('Prompts'), performance: section('Performance'), providers: section('Providers'), audit: section('Audit'), flags: section('Flags'), cloud: section('Cloud') }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public routes live OUTSIDE the login wall (share links later; dev gallery only in dev). */}
        {import.meta.env.DEV && <Route path="/dev/gallery" element={<DevGallery />} />}
        <Route path="/*" element={
      <RequireAuth>
        <EntitlementsProvider>
        <FlagsProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/start" element={<StartPage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/edit/:id" element={<EditorPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/created" element={<CreatedPage />} />
          <Route path="/projects/:projectId" element={<CreatedPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/present/:id" element={<PresentPage />} />
          <Route path="/admin" element={<Suspense fallback={<div className="min-h-screen grid place-items-center text-muted">Loading…</div>}><AdminLayout /></Suspense>}>
            <Route index element={<Suspense fallback={null}><views.Overview /></Suspense>} />
            <Route path="tokens" element={<Suspense fallback={null}><views.Tokens /></Suspense>} />
            <Route path="models" element={<Suspense fallback={null}><views.Models /></Suspense>} />
            <Route path="users" element={<Suspense fallback={null}><views.Users /></Suspense>} />
            <Route path="countries" element={<Suspense fallback={null}><views.Countries /></Suspense>} />
            <Route path="errors" element={<Suspense fallback={null}><views.Errors /></Suspense>} />
            {Object.entries(sections).map(([path, View]) => <Route key={path} path={path} element={<Suspense fallback={null}><View /></Suspense>} />)}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <UpgradeModal />
        </FlagsProvider>
        </EntitlementsProvider>
      </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
