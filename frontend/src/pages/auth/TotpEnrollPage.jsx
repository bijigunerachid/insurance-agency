import { useAuth } from '../../features/auth/AuthContext.jsx';
import { TotpEnrollment } from '../../features/auth/TotpEnrollment.jsx';
import { fr } from '../../i18n/fr.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';
import { SignOutLink } from './TotpVerifyPage.jsx';

export function TotpEnrollPage() {
  const { logout } = useAuth();
  return (
    <AuthLayout
      title={fr.totp.enrollTitle}
      intro={fr.totp.enrollIntro}
      footer={<SignOutLink onClick={logout} />}
    >
      <TotpEnrollment />
    </AuthLayout>
  );
}
