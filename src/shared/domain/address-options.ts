export interface AddressOption {
  code: string;
  name: string;
}

/**
 * The 50 states, DC, the US territories and the military "states", ordered
 * alphabetically by name. Values are the standard 2-letter postal
 * abbreviations — what's actually stored and displayed as an order's `region`
 * (e.g. "Houston, TX").
 *
 * The territories and AA/AE/AP matter: this list is the *only* thing the US
 * address check consults, so a code missing from it isn't merely absent from a
 * dropdown — that customer is refused at checkout with "Choose a US state" and
 * has no way through. USPS delivers to all of these at domestic rates.
 */
export const US_STATES: AddressOption[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  // Territories and freely-associated states. USPS treats these as domestic.
  { code: 'AS', name: 'American Samoa' },
  { code: 'FM', name: 'Federated States of Micronesia' },
  { code: 'GU', name: 'Guam' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'PW', name: 'Palau' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
  // Military addresses. The "state" encodes the theatre, not a place: AA is
  // the Americas, AE Europe/Africa/Middle East, AP the Pacific. A service
  // member typing APO/FPO with one of these is a normal domestic shipment.
  { code: 'AA', name: 'Armed Forces Americas (AA)' },
  { code: 'AE', name: 'Armed Forces Europe (AE)' },
  { code: 'AP', name: 'Armed Forces Pacific (AP)' },
];

/** Not exhaustive — the countries this storefront's customers most
 * commonly ship to, with the US pinned first as the default. Values are
 * ISO 3166-1 alpha-2 codes, matching what's already stored as an order's
 * `country` (e.g. "US"). */
export const COMMON_COUNTRIES: AddressOption[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PT', name: 'Portugal' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' },
  { code: 'ZA', name: 'South Africa' },
];
