import { ComingSoon } from '@/ui';

export interface NearbyScreenProps {
  dish: string;
}

/** Placeholder until the nearby feature ships. */
export function NearbyScreen(_props: NearbyScreenProps) {
  return (
    <ComingSoon title="Nearby" description="Places near you that serve this dish." icon="map" />
  );
}
