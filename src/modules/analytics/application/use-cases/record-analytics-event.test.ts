import { describe, expect, it } from 'vitest';

import { RecordAnalyticsEvent } from './record-analytics-event';
import type {
  AnalyticsEventInput,
  AnalyticsEventRepository,
} from '@/modules/analytics/application/ports/analytics-event-repository';
import type { IpGeoLookup, IpLocation } from '@/modules/analytics/application/ports/ip-geo-lookup';

function fakeRepo(recorded: AnalyticsEventInput[]): AnalyticsEventRepository {
  return {
    async record(event) {
      recorded.push(event);
    },
    async countByTypePerDay() {
      return [];
    },
    async topValues() {
      return [];
    },
    async topSearchTerms() {
      return [];
    },
    async listByType() {
      return { items: [], total: 0 };
    },
    async averageDwellByPath() {
      return [];
    },
    async viewsByCountry() {
      return [];
    },
    async viewsByRegion() {
      return [];
    },
    async viewsByCity() {
      return [];
    },
    async listBySessionId() {
      return [];
    },
  };
}

const US: IpLocation = {
  countryCode: 'US',
  country: 'United States',
  continentCode: 'NA',
  continent: 'North America',
  region: 'California',
  city: 'Mountain View',
  latitude: 37.422,
  longitude: -122.085,
};

const geoAlways: IpGeoLookup = { lookup: async () => US };
const geoNever: IpGeoLookup = { lookup: async () => null };

const baseInput: AnalyticsEventInput = {
  eventType: 'page_view',
  sessionId: 's1',
  userId: null,
  path: '/products',
};

describe('RecordAnalyticsEvent', () => {
  it('passes the event through to the repository', async () => {
    const recorded: AnalyticsEventInput[] = [];

    await new RecordAnalyticsEvent(fakeRepo(recorded)).execute(baseInput);

    expect(recorded).toEqual([baseInput]);
  });

  it('adds the resolved country to the event metadata', async () => {
    const recorded: AnalyticsEventInput[] = [];

    await new RecordAnalyticsEvent(fakeRepo(recorded), geoAlways).execute({
      ...baseInput,
      ipAddress: '8.8.8.8',
    });

    expect(recorded[0]?.metadata).toEqual({
      country: 'United States',
      countryCode: 'US',
      continent: 'North America',
      region: 'California',
      city: 'Mountain View',
      latitude: 37.422,
      longitude: -122.085,
    });
  });

  it('stores a null region rather than omitting it', async () => {
    // Distinguishes "resolved, no subdivision" from "recorded before
    // regions were captured at all".
    const recorded: AnalyticsEventInput[] = [];
    const countryOnly: IpGeoLookup = {
      lookup: async () => ({ ...US, region: null, city: null, latitude: null, longitude: null }),
    };

    await new RecordAnalyticsEvent(fakeRepo(recorded), countryOnly).execute({
      ...baseInput,
      ipAddress: '8.8.8.8',
    });

    expect(recorded[0]?.metadata).toMatchObject({ region: null, city: null });
  });

  it('keeps metadata the caller already set', async () => {
    // Cart and dwell events carry their own metadata; enrichment must add to
    // it rather than replace it.
    const recorded: AnalyticsEventInput[] = [];

    await new RecordAnalyticsEvent(fakeRepo(recorded), geoAlways).execute({
      ...baseInput,
      eventType: 'page_exit',
      ipAddress: '8.8.8.8',
      metadata: { durationMs: 4200 },
    });

    expect(recorded[0]?.metadata).toMatchObject({ durationMs: 4200, country: 'United States' });
  });

  it('records the event unchanged when the address does not resolve', async () => {
    // Private and loopback addresses are the norm in local development.
    const recorded: AnalyticsEventInput[] = [];
    const input = { ...baseInput, ipAddress: '127.0.0.1' };

    await new RecordAnalyticsEvent(fakeRepo(recorded), geoNever).execute(input);

    expect(recorded).toEqual([input]);
  });

  it('records the event unchanged when there is no IP at all', async () => {
    const recorded: AnalyticsEventInput[] = [];

    await new RecordAnalyticsEvent(fakeRepo(recorded), geoAlways).execute(baseInput);

    expect(recorded).toEqual([baseInput]);
  });
});
