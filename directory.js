/*
 * Scholarships and schools directory.
 * Every entry below was checked against official or university websites on 25 November 2026.
 * Deadlines and entry requirements change every year, so none are listed here: always read the official notice.
 * To add an entry, copy one and edit it. Only add opportunities you have verified on the official website.
 */
window.CONCORD_DIR = {
  checked: '25 November 2026',
  scholarships: [
    {
      name: 'Ghana Scholarships Authority',
      formerly: 'Formerly the Ghana Scholarships Secretariat',
      type: 'Ghana', level: 'Tertiary (local and foreign)',
      blurb: 'The government body that manages government scholarships for Ghanaians, for study in Ghana and abroad. Applications are made through its online portal.',
      site: 'https://scholarships.gov.gh', apply: 'https://apply.scholarships.gov.gh',
      note: 'Read each official notice for eligibility, documents and deadlines. Never pay an agent or believe promises of a guaranteed place.'
    },
    {
      name: 'Chevening Scholarships',
      type: 'International', level: 'Master’s (postgraduate)',
      blurb: 'The UK government’s global scholarship programme for outstanding emerging leaders to study a one-year master’s degree in the UK.',
      site: 'https://www.chevening.org',
      note: 'Applications usually open around August and close in early October. You need an undergraduate degree and work experience.'
    },
    {
      name: 'Commonwealth Scholarships',
      type: 'International', level: 'Postgraduate',
      blurb: 'UK government scholarships, managed by the Commonwealth Scholarship Commission, for people from Commonwealth countries who could not otherwise afford to study in the UK.',
      site: 'https://cscuk.fcdo.gov.uk',
      note: 'Different awards have different eligibility and deadlines. The Commission only accepts applications through its own official system and does not charge to apply.'
    }
  ],
  schools: [
    { name: 'Kwame Nkrumah University of Science and Technology', short: 'KNUST', city: 'Kumasi', region: 'Ashanti', type: 'Public university',
      site: 'https://www.knust.edu.gh', apply: 'https://apps.knust.edu.gh/admissions/' },
    { name: 'University of Ghana', short: 'UG', city: 'Legon, Accra', region: 'Greater Accra', type: 'Public university', site: 'https://www.ug.edu.gh' },
    { name: 'University of Cape Coast', short: 'UCC', city: 'Cape Coast', region: 'Central', type: 'Public university', site: 'https://www.ucc.edu.gh' },
    { name: 'University for Development Studies', short: 'UDS', city: 'Tamale', region: 'Northern', type: 'Public university', site: 'https://uds.edu.gh' },
    { name: 'University of Education, Winneba', short: 'UEW', city: 'Winneba', region: 'Central', type: 'Public university', site: 'https://www.uew.edu.gh' }
  ]
};
