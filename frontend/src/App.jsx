import { Navigate, Route, Routes } from 'react-router';
import { ErrorState } from './components/ErrorState.jsx';
import { Spinner } from './components/Spinner.jsx';
import { AgencyBrandProvider } from './features/agency/AgencyBrand.jsx';
import { AuthProvider, useAuth } from './features/auth/AuthContext.jsx';
import { fr } from './i18n/fr.js';
import { AppLayout, NAV_ITEMS } from './layouts/AppLayout.jsx';
import { AccountPage } from './pages/AccountPage.jsx';
import { AuditPage } from './pages/audit/AuditPage.jsx';
import { CataloguePage } from './pages/catalogue/CataloguePage.jsx';
import { ContractDetailPage } from './pages/contracts/ContractDetailPage.jsx';
import { ContractFormPage } from './pages/contracts/ContractFormPage.jsx';
import { ContractsPage } from './pages/contracts/ContractsPage.jsx';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage.jsx';
import { DocumentCapturePage } from './pages/documents/DocumentCapturePage.jsx';
import { CustomerFormPage } from './pages/customers/CustomerFormPage.jsx';
import { CustomersPage } from './pages/customers/CustomersPage.jsx';
import { LoginPage } from './pages/auth/LoginPage.jsx';
import { PasswordChangePage } from './pages/auth/PasswordChangePage.jsx';
import { TotpEnrollPage } from './pages/auth/TotpEnrollPage.jsx';
import { TotpVerifyPage } from './pages/auth/TotpVerifyPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { NotFound } from './pages/NotFound.jsx';
import { PaymentsPage } from './pages/payments/PaymentsPage.jsx';
import { ReceiptPage } from './pages/payments/ReceiptPage.jsx';
import { RemittanceDetailPage } from './pages/remittances/RemittanceDetailPage.jsx';
import { RemittancesPage } from './pages/remittances/RemittancesPage.jsx';
import { ReportsPage } from './pages/reports/ReportsPage.jsx';
import { ScanReviewPage } from './pages/scans/ScanReviewPage.jsx';
import { ScansPage } from './pages/scans/ScansPage.jsx';
import { RenewalDetailPage } from './pages/renewals/RenewalDetailPage.jsx';
import { RenewalsPage } from './pages/renewals/RenewalsPage.jsx';
import { RuleDetailPage } from './pages/rules/RuleDetailPage.jsx';
import { RulesPage } from './pages/rules/RulesPage.jsx';
import { StockPage } from './pages/stock/StockPage.jsx';
import { SystemStatus } from './pages/SystemStatus.jsx';
import { UserDetailPage } from './pages/users/UserDetailPage.jsx';
import { VehicleDetailPage } from './pages/vehicles/VehicleDetailPage.jsx';
import { VehicleFormPage } from './pages/vehicles/VehicleFormPage.jsx';
import { VehiclesPage } from './pages/vehicles/VehiclesPage.jsx';
import { UsersPage } from './pages/users/UsersPage.jsx';

export function App() {
  return (
    <AgencyBrandProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </AgencyBrandProvider>
  );
}

/** Shows the sign-in step the server asks for; the application only once fully signed in. */
function AuthGate() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label={fr.app.loading} />
      </div>
    );
  }
  if (auth.status === 'error') {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState
          title={fr.status.errorTitle}
          body={fr.status.errorBody}
          requestId={auth.error?.requestId}
        />
      </div>
    );
  }
  if (auth.status === 'anonymous') return <LoginPage />;

  switch (auth.me.stage) {
    case 'TOTP_VERIFY':
      return <TotpVerifyPage />;
    case 'PASSWORD_CHANGE':
      return <PasswordChangePage />;
    case 'TOTP_ENROLL':
      return <TotpEnrollPage />;
    default:
      return <SignedInRoutes />;
  }
}

function SignedInRoutes() {
  const { can } = useAuth();
  const home = NAV_ITEMS.find((item) => !item.permission || can(item.permission)).to;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={home} replace />} />
        {can('renewals.read') && <Route path="accueil" element={<HomePage />} />}
        {can('customers.read') && <Route path="clients" element={<CustomersPage />} />}
        {can('customers.write') && <Route path="clients/nouveau" element={<CustomerFormPage />} />}
        {can('customers.read') && <Route path="clients/:id" element={<CustomerDetailPage />} />}
        {can('customers.write') && (
          <Route path="clients/:id/modifier" element={<CustomerFormPage />} />
        )}
        {can('vehicles.read') && <Route path="vehicules" element={<VehiclesPage />} />}
        {can('vehicles.write') && <Route path="vehicules/nouveau" element={<VehicleFormPage />} />}
        {can('vehicles.read') && <Route path="vehicules/:id" element={<VehicleDetailPage />} />}
        {can('vehicles.write') && (
          <Route path="vehicules/:id/modifier" element={<VehicleFormPage />} />
        )}
        {can('contracts.read') && <Route path="contrats" element={<ContractsPage />} />}
        {can('contracts.write') && <Route path="contrats/nouveau" element={<ContractFormPage />} />}
        {can('contracts.read') && <Route path="contrats/:id" element={<ContractDetailPage />} />}
        {can('contracts.write') && (
          <Route path="contrats/:id/modifier" element={<ContractFormPage />} />
        )}
        {can('renewals.read') && <Route path="renouvellements" element={<RenewalsPage />} />}
        {can('renewals.read') && (
          <Route path="renouvellements/:id" element={<RenewalDetailPage />} />
        )}
        {can('payments.read') && <Route path="paiements" element={<PaymentsPage />} />}
        {can('payments.read') && <Route path="recus/:id" element={<ReceiptPage />} />}
        {can('remittances.read') && <Route path="reversements" element={<RemittancesPage />} />}
        {can('reports.read') && <Route path="rapports" element={<ReportsPage />} />}
        {can('scans.manage') && <Route path="scans" element={<ScansPage />} />}
        {can('scans.manage') && <Route path="scans/:id" element={<ScanReviewPage />} />}
        {can('documents.download') && (
          <Route path="documents/:id/saisie" element={<DocumentCapturePage />} />
        )}
        {can('remittances.read') && (
          <Route path="reversements/:id" element={<RemittanceDetailPage />} />
        )}
        {can('stock.read') && <Route path="stock" element={<StockPage />} />}
        {can('catalogue.read') && <Route path="catalogue" element={<CataloguePage />} />}
        {can('catalogue.read') && <Route path="regles" element={<RulesPage />} />}
        {can('catalogue.read') && <Route path="regles/:id" element={<RuleDetailPage />} />}
        {can('system.health') && <Route path="systeme" element={<SystemStatus />} />}
        {can('users.read') && <Route path="utilisateurs" element={<UsersPage />} />}
        {can('users.read') && <Route path="utilisateurs/:id" element={<UserDetailPage />} />}
        {can('audit.read') && <Route path="journal" element={<AuditPage />} />}
        <Route path="compte" element={<AccountPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
