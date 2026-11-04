import { Link } from 'react-router';

export const textLinkClasses =
  'focus-ring rounded-control font-medium text-primary underline-offset-2 hover:text-primary-hover hover:underline';

/** A link inside text or a table: the action colour, underlined on hover. */
export function TextLink({ className = '', ...props }) {
  return <Link className={`${textLinkClasses} ${className}`} {...props} />;
}
