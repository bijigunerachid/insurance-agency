/** The agency's details from the installation's settings (null when unset). */
export function agencyDetails(config) {
  const value = (name) => config[name] ?? null;
  return {
    name: value('AGENCY_NAME'),
    tagline: value('AGENCY_TAGLINE'),
    address: value('AGENCY_ADDRESS'),
    phone: value('AGENCY_PHONE'),
    fax: value('AGENCY_FAX'),
    email: value('AGENCY_EMAIL'),
    ice: value('AGENCY_ICE'),
    acapsNumber: value('AGENCY_ACAPS_NUMBER'),
    legalForm: value('AGENCY_LEGAL_FORM'),
    patente: value('AGENCY_PATENTE'),
    taxId: value('AGENCY_IF'),
    rc: value('AGENCY_RC'),
    cnss: value('AGENCY_CNSS'),
    logo: Boolean(config.AGENCY_LOGO),
  };
}
