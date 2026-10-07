import { ActivityPlayerPage } from "@/components/learning/LearningJourney";

interface PageProps {
  params: Promise<{ activityId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { activityId } = await params;
  return <ActivityPlayerPage activityId={activityId} />;
}
