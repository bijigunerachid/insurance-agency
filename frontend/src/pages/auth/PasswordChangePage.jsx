import { useAuth } from '../../features/auth/AuthContext.jsx';
import { PasswordChangeForm } from '../../features/auth/PasswordChangeForm.jsx';
import { fr } from '../../i18n/fr.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';
import { SignOutLink } from './TotpVerifyPage.jsx';

export function PasswordChangePage() {
  const { logout } = useAuth();
  return (
    <AuthLayout
      title={fr.password.changeTitle}
      intro={fr.password.changeForcedIntro}
      footer={<SignOutLink onClick={logout} />}
    >
      <PasswordChangeForm />
    </AuthLayout>
  );
}
