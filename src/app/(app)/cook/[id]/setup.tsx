import { ComingSoon } from '@/ui';

/** Placeholder until the screen lands; registered now so parallel work does not collide here. */
export default function AppCookSetupRoute() {
  return (
    <ComingSoon
      title="Set up your phone"
      description="Mount your phone so the coach can see your counter."
      safeTop
    />
  );
}
