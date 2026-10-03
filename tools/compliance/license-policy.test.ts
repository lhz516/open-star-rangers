import { describe, expect, it } from 'vitest';
import { licensePolicy } from './license-policy.ts';

describe('conservative SPDX policy', () => {
  it.each(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'BlueOak-1.0.0', 'CC0-1.0'])('allows reviewed permissive %s', license => {
    expect(licensePolicy(license, true)).toEqual({ classification: 'permissive', selectedLicenses: [license] });
  });
  it('records OR choice and requires all AND obligations with parentheses', () => {
    expect(licensePolicy('GPL-3.0-only OR MIT', true).selectedLicenses).toEqual(['MIT']);
    expect(licensePolicy('(MIT OR GPL-3.0-only) AND Apache-2.0', true).selectedLicenses).toEqual(['Apache-2.0', 'MIT']);
    expect(() => licensePolicy('MIT AND GPL-3.0-only', true)).toThrow();
  });
  it.each(['', 'MIT OR', 'UNKNOWN', 'LicenseRef-Unproven', 'DocumentRef-Unproven:LicenseRef-Proprietary',
    'MPL-2.0', 'GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only', 'LGPL-2.1-only', 'LGPL-3.0-or-later',
    'MIT WITH Classpath-exception-2.0', 'CC-BY-3.0'])('does not waive website obligations for %s', license => {
    expect(() => licensePolicy(license, true)).toThrow();
  });
  it('distinguishes proven non-distribution from permission to ship', () => {
    expect(licensePolicy('MPL-2.0', false).classification).toBe('not-distributed-known-copyleft');
    expect(licensePolicy('CC-BY-3.0', false).classification).toBe('not-distributed-known-attribution');
    expect(licensePolicy('MPL-2.0 AND CC-BY-3.0', false).selectedLicenses).toEqual(['CC-BY-3.0', 'MPL-2.0']);
    expect(() => licensePolicy('LicenseRef-Unproven', false)).toThrow();
  });
});
