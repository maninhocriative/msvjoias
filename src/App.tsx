import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "./contexts/AuthContext";
import MainLayout from "./components/layout/MainLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import Reports from "./pages/Reports";
import Auth from "./pages/Auth";
import Register from "./pages/Register";
import PendingApproval from "./pages/PendingApproval";
import WebhookTester from "./pages/WebhookTester";
import ApiDocs from "./pages/ApiDocs";
import PublicApiDocs from "./pages/PublicApiDocs";
import DatabaseNomenclature from "./pages/DatabaseNomenclature";
import FiqonIntegrationText from "./pages/FiqonIntegrationText";
import Customers from "./pages/Customers";
import Offers from "./pages/Offers";
import StoreSettings from "./pages/StoreSettings";
import AI from "./pages/AI";
import AIConfig from "./pages/AIConfig";
import PendingOrders from "./pages/PendingOrders";
import FollowupMonitor from "./pages/FollowupMonitor";
import SellerMonitor from "./pages/SellerMonitor";
import CampaignBroadcast from "./pages/CampaignBroadcast";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/register" element={<Register />} />
              <Route path="/pending-approval" element={<PendingApproval />} />
              <Route path="/docs" element={<PublicApiDocs />} />
              <Route path="/nomenclatura" element={<DatabaseNomenclature />} />
              <Route path="/fiqon-integration" element={<FiqonIntegrationText />} />
              <Route path="/privacidade" element={<PrivacyPolicy />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<MainLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/products/:id" element={<ProductDetail />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/users/:id" element={<UserDetail />} />
                  <Route path="/webhook-tester" element={<WebhookTester />} />
                  <Route path="/api-docs" element={<ApiDocs />} />
                  <Route path="/db-nomenclature" element={<DatabaseNomenclature />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/offers" element={<Offers />} />
                  <Route path="/store-settings" element={<StoreSettings />} />
                  <Route path="/ai" element={<AI />} />
                  <Route path="/ai/config" element={<AIConfig />} />
                  <Route path="/ai/followups" element={<FollowupMonitor />} />
                  <Route path="/seller-monitor" element={<SellerMonitor />} />
                  <Route path="/pedidos/pendentes" element={<PendingOrders />} />
                  <Route path="/campaigns" element={<CampaignBroadcast />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
