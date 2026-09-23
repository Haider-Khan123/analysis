import { EMAIL_REGEX } from "@/lib/validators";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type GuardianValues = {
  full_name: string;
  relationship: "father" | "mother" | "guardian" | "";
  phone: string;
  email: string;
  address: string;
  is_primary: boolean;
};

export type StudentFormValues = {
  attendance_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  gender: "" | "male" | "female" | "other";
  date_of_birth: string;
  photo_data_url: string | null;
  admission_date: string;
  class_id: string;
  section_id: string;
  status: "active" | "inactive";
  guardians: GuardianValues[];
};

export const emptyGuardian: GuardianValues = {
  full_name: "", relationship: "", phone: "", email: "", address: "", is_primary: false,
};

export const emptyStudent: StudentFormValues = {
  attendance_id: "", admission_number: "", first_name: "", last_name: "",
  gender: "", date_of_birth: "", photo_data_url: null,
  admission_date: "", class_id: "", section_id: "", status: "active",
  guardians: [],
};

const phoneRegex = /^[+0-9 \-()]{7,20}$/;
const emailRegex = EMAIL_REGEX;

export function validateStudent(v: StudentFormValues): string | null {
  if (!v.admission_number.trim()) return "Admission number is required.";
  if (!v.first_name.trim()) return "First name is required.";
  if (!v.last_name.trim()) return "Last name is required.";
  if (!v.gender) return "Gender is required.";
  if (!v.date_of_birth) return "Date of birth is required.";
  if (!v.admission_date) return "Admission date is required.";
  if (!v.class_id) return "Class is required.";
  if (!v.section_id) return "Section is required.";
  // Guardians are optional. If any guardian fields are filled, validate that guardian.
  for (const [i, g] of v.guardians.entries()) {
    const hasAny = g.full_name.trim() || g.relationship || g.phone.trim() || g.email.trim() || g.address.trim();
    if (!hasAny) continue;
    const tag = `Guardian ${i + 1}`;
    if (!g.full_name.trim()) return `${tag}: full name is required.`;
    if (!g.relationship) return `${tag}: relationship is required.`;
    if (!phoneRegex.test(g.phone.trim())) return `${tag}: valid mobile is required.`;
    if (g.email && !emailRegex.test(g.email.trim())) return `${tag}: please enter a valid email address (e.g., name@example.com).`;
  }
  return null;
}

export function StudentForm({
  value, onChange, classes, sections,
}: {
  value: StudentFormValues;
  onChange: (v: StudentFormValues) => void;
  classes: { id: string; name: string }[];
  sections: { id: string; name: string; class_id: string }[];
}) {
  const set = <K extends keyof StudentFormValues>(k: K, val: StudentFormValues[K]) =>
    onChange({ ...value, [k]: val });
  const [tab, setTab] = useState("basic");

  const uniqueClasses = useMemo(() => {
    const seen = new Set<string>();
    return classes.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  }, [classes]);
  const sectionsForClass = sections.filter((s) => s.class_id === value.class_id);

  const onPhoto = async (file: File) => {
    if (file.size > 900_000) { toast.error("Image too large (max ~900 KB)."); return; }
    const reader = new FileReader();
    reader.onload = () => set("photo_data_url", String(reader.result));
    reader.readAsDataURL(file);
  };

  const updateGuardian = (i: number, patch: Partial<GuardianValues>) => {
    const next = value.guardians.map((g, idx) => idx === i ? { ...g, ...patch } : g);
    onChange({ ...value, guardians: next });
  };
  const addGuardian = () => onChange({ ...value, guardians: [...value.guardians, { ...emptyGuardian, is_primary: value.guardians.length === 0 }] });
  const removeGuardian = (i: number) => {
    const next = value.guardians.filter((_, idx) => idx !== i);
    if (next.length && !next.some((g) => g.is_primary)) next[0].is_primary = true;
    onChange({ ...value, guardians: next });
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="basic">Basic</TabsTrigger>
        <TabsTrigger value="admission">Admission</TabsTrigger>
        <TabsTrigger value="guardians">Guardians</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-border bg-muted">
            {value.photo_data_url ? (
              <img src={value.photo_data_url} alt="" className="h-full w-full object-cover" />
            ) : <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">No photo</div>}
          </div>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
              <Upload className="h-3.5 w-3.5" /> Upload Photo
            </span>
          </label>
          {value.photo_data_url && (
            <Button type="button" size="sm" variant="ghost" onClick={() => set("photo_data_url", null)}>Remove</Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Row label="Admission Number *"><Input value={value.admission_number} onChange={(e) => set("admission_number", e.target.value)} /></Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="First Name *"><Input value={value.first_name} onChange={(e) => set("first_name", e.target.value)} /></Row>
          <Row label="Last Name *"><Input value={value.last_name} onChange={(e) => set("last_name", e.target.value)} /></Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Gender *">
            <Select value={value.gender || undefined} onValueChange={(v) => set("gender", v as StudentFormValues["gender"])}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Date Of Birth *"><Input type="date" value={value.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Row>
        </div>
      </TabsContent>

      <TabsContent value="admission" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Row label="Admission Date *"><Input type="date" value={value.admission_date} onChange={(e) => set("admission_date", e.target.value)} /></Row>
          <Row label="Status">
            <Select value={value.status} onValueChange={(v) => set("status", v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Class *">
            <Select value={value.class_id || undefined} onValueChange={(v) => onChange({ ...value, class_id: v, section_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {uniqueClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Section *">
            <Select value={value.section_id || undefined} onValueChange={(v) => set("section_id", v)} disabled={!value.class_id}>
              <SelectTrigger><SelectValue placeholder={value.class_id ? "Select section" : "Pick a class first"} /></SelectTrigger>
              <SelectContent>
                {sectionsForClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
        </div>
      </TabsContent>

      <TabsContent value="guardians" className="space-y-4">
        <p className="text-xs text-muted-foreground">Guardians are optional. If added, the first one is the Primary Guardian.</p>
        {value.guardians.map((g, i) => (
          <div key={i} className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{i === 0 ? "Primary Guardian" : `Guardian ${i + 1}`}</div>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeGuardian(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Full Name *"><Input value={g.full_name} onChange={(e) => updateGuardian(i, { full_name: e.target.value })} /></Row>
              <Row label="Relationship *">
                <Select value={g.relationship || undefined} onValueChange={(v) => updateGuardian(i, { relationship: v as GuardianValues["relationship"] })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="father">Father</SelectItem>
                    <SelectItem value="mother">Mother</SelectItem>
                    <SelectItem value="guardian">Guardian</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Mobile Number *"><Input value={g.phone} onChange={(e) => updateGuardian(i, { phone: e.target.value })} /></Row>
              <Row label="Email Address"><Input type="email" value={g.email} onChange={(e) => updateGuardian(i, { email: e.target.value })} /></Row>
            </div>
            <Row label="Residential Address">
              <Textarea rows={2} value={g.address} onChange={(e) => updateGuardian(i, { address: e.target.value })} />
            </Row>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addGuardian}>
          <Plus className="mr-1 h-4 w-4" /> Add Another Guardian
        </Button>
      </TabsContent>
    </Tabs>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

export function studentFromRow(
  row: Record<string, unknown>,
  guardians: Record<string, unknown>[],
): StudentFormValues {
  return {
    ...emptyStudent,
    attendance_id: (row.attendance_id as string) ?? "",
    admission_number: (row.admission_number as string) ?? "",
    first_name: (row.first_name as string) ?? "",
    last_name: (row.last_name as string) ?? "",
    gender: ((row.gender as string) ?? "") as StudentFormValues["gender"],
    date_of_birth: (row.date_of_birth as string) ?? "",
    photo_data_url: (row.photo_url as string) ?? null,
    admission_date: ((row.admission_date ?? row.enrollment_date) as string) ?? "",
    class_id: (row.class_id as string) ?? "",
    section_id: (row.section_id as string) ?? "",
    status: ((row.status as string) ?? "active") as "active" | "inactive",
    guardians: guardians.length
      ? guardians.map((g) => ({
          full_name: (g.full_name as string) ?? "",
          relationship: ((g.relationship as string) ?? "") as GuardianValues["relationship"],
          phone: (g.phone as string) ?? "",
          email: (g.email as string) ?? "",
          address: (g.address as string) ?? "",
          is_primary: Boolean(g.is_primary),
        }))
      : [{ ...emptyGuardian, is_primary: true }],
  };
}
