// the Morph templates register themselves with the layout engine when imported (editing a Morph slide re-composes it from its template)
import '@prompttoppt/theme/morph-templates'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { UpgradeModal } from '@/components/UpgradeModal'
import { EntitlementsProvider } from '@/lib/entitlements'
import { FlagsProvider } from '@/lib/flags'
import { DevGallery } from '@/pages/DevGallery'
import { RequireAuth } from '@/lib/session'
import { WelcomeGate } from '@/components/WelcomeGate'
import { HomePage } from '@/pages/HomePage'
import { StartPage } from '@/pages/StartPage'
import './index.css'
import '@prompttoppt/ui/prose.css'
import { SlideLoader } from './components/SlideLoader'

// Each page is its own chunk: signing in no longer downloads the whole editor, the slideshow player and the billing screens first; a page's code arrives when it is opened.
const CreatePage = lazy(() => import('@/pages/CreatePage').then((m) => ({ default: m.CreatePage })))
const ScratchPage = lazy(() => import('@/pages/ScratchPage').then((m) => ({ default: m.ScratchPage })))
const EditorPage = lazy(() => import('@/pages/EditorPage').then((m) => ({ default: m.EditorPage })))
const BillingPage = lazy(() => import('@/pages/BillingPage').then((m) => ({ default: m.BillingPage })))
const PresentPage = lazy(() => import('@/pages/PresentPage').then((m) => ({ default: m.PresentPage })))
const CreatedPage = lazy(() => import('@/pages/CreatedPage').then((m) => ({ default: m.CreatedPage })))
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })))
const InvitePage = lazy(() => import('@/pages/InvitePage').then((m) => ({ default: m.InvitePage })))
const SharedPage = lazy(() => import('@/pages/SharedPage').then((m) => ({ default: m.SharedPage })))
const SharedViewPage = lazy(() => import('@/pages/SharedViewPage').then((m) => ({ default: m.SharedViewPage })))

// Owner dashboard is its own chunk: regular users never download it (the API enforces admin-only regardless).
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const adminView = (name: 'Overview' | 'Tokens' | 'Models' | 'Users' | 'Countries' | 'Errors') => lazy(() => import('@/pages/admin/UsageViews').then((m) => ({ default: m[name] })))
const views = { Overview: adminView('Overview'), Tokens: adminView('Tokens'), Models: adminView('Models'), Users: adminView('Users'), Countries: adminView('Countries'), Errors: adminView('Errors') }

const PostEdit = lazy(() => import('@/pages/admin/sections/PostEdit'))
const section = (name: string) => lazy(() => import(`@/pages/admin/sections/${name}.tsx`))
const sections = { sales: section('Sales'), subscriptions: section('Subscriptions'), images: section('Images'), morph: section('Morph'), margin: section('Margin'), presentations: section('Presentations'), exports: section('Exports'), prompts: section('Prompts'), performance: section('Performance'), providers: section('Providers'), audit: section('Audit'), flags: section('Flags'), cloud: section('Cloud'), reviews: section('Reviews'), posts: section('Posts'), support: section('Support') }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public routes live OUTSIDE the login wall (share links later; dev gallery only in dev). */}
        <Route path="/s/:token" element={<Suspense fallback={<SlideLoader fullScreen size="lg" label="Opening the presentation" />}><SharedViewPage /></Suspense>} />
        {import.meta.env.DEV && <Route path="/dev/gallery" element={<DevGallery />} />}
        <Route path="/*" element={
      <RequireAuth>
        <WelcomeGate>
        <EntitlementsProvider>
        <FlagsProvider>
        <Suspense fallback={<SlideLoader fullScreen size="lg" label="Loading" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/start" element={<StartPage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/scratch" element={<ScratchPage />} />
          <Route path="/edit/:id" element={<EditorPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/created" element={<CreatedPage />} />
          <Route path="/projects/:projectId" element={<CreatedPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/shared" element={<SharedPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/present/:id" element={<PresentPage />} />
          <Route path="/admin" element={<Suspense fallback={<SlideLoader fullScreen size="lg" label="Loading" />}><AdminLayout /></Suspense>}>
            <Route index element={<Suspense fallback={null}><views.Overview /></Suspense>} />
            <Route path="tokens" element={<Suspense fallback={null}><views.Tokens /></Suspense>} />
            <Route path="models" element={<Suspense fallback={null}><views.Models /></Suspense>} />
            <Route path="users" element={<Suspense fallback={null}><views.Users /></Suspense>} />
            <Route path="countries" element={<Suspense fallback={null}><views.Countries /></Suspense>} />
            <Route path="errors" element={<Suspense fallback={null}><views.Errors /></Suspense>} />
            <Route path="posts/:id" element={<Suspense fallback={null}><PostEdit /></Suspense>} />
            {Object.entries(sections).map(([path, View]) => <Route key={path} path={path} element={<Suspense fallback={null}><View /></Suspense>} />)}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <UpgradeModal />
        </FlagsProvider>
        </EntitlementsProvider>
        </WelcomeGate>
      </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
