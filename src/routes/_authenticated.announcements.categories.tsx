import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/announcements/categories")({
  component: CategoriesPage,
});

const CATS: Array<{ key: string; label: string; scope: "School-Wide" | "Class-Specific"; example: string }> = [
  { key: "school_closure", label: "School Closure", scope: "School-Wide", example: "School will remain closed tomorrow due to weather." },
  { key: "public_holiday", label: "Public Holiday", scope: "School-Wide", example: "School closed for national holiday." },
  { key: "sports_day", label: "Sports Day", scope: "School-Wide", example: "Annual sports day scheduled next Friday." },
  { key: "parent_teacher_meeting", label: "Parent–Teacher Meeting", scope: "School-Wide", example: "PTM this Saturday from 10am–1pm." },
  { key: "exam_schedule", label: "Examination Schedule", scope: "School-Wide", example: "Final exams begin from Dec 1." },
  { key: "homework_reminder", label: "Homework Reminder", scope: "Class-Specific", example: "Math homework due tomorrow." },
  { key: "class_test", label: "Class Test Notice", scope: "Class-Specific", example: "Surprise test on Chapter 4 tomorrow." },
  { key: "field_trip", label: "Field Trip", scope: "Class-Specific", example: "Field trip to museum on Friday." },
  { key: "project_submission", label: "Project Submission Reminder", scope: "Class-Specific", example: "Submit science project by Monday." },
  { key: "other", label: "Other", scope: "School-Wide", example: "General notice." },
];

function CategoriesPage() {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Announcement Categories</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CATS.map((c) => (
            <div key={c.key} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{c.label}</p>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{c.scope}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{c.example}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
