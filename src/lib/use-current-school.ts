import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { getMySchool } from "@/lib/school.functions";

export function useCurrentSchool() {
  const { isAuthenticated, profile } = useAuth();
  const fetchSchool = useServerFn(getMySchool);

  const schoolQuery = useQuery({
    queryKey: ["my-school"],
    queryFn: () => fetchSchool(),
    enabled: isAuthenticated,
  });

  const school = schoolQuery.data?.school ?? null;

  return {
    ...schoolQuery,
    school,
    schoolId: school?.id ?? profile?.school_id ?? null,
    schoolName: school?.name ?? null,
  };
}