import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { titleCase } from "@/lib/utils";

export const PARENT_RELATIONSHIPS = [
  "father", "mother", "guardian", "grandfather", "grandmother", "uncle", "aunt", "other",
] as const;
export type ParentRelationship = typeof PARENT_RELATIONSHIPS[number];

export type ParentStudentLink = {
  student_id: string;
  relationship_type: ParentRelationship;
  is_primary: boolean;
};

export type ParentFormValues = {
  parent_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  alternate_phone: string;
  email: string;
  cnic: string;
  occupation: string;
  address: string;
  city: string;
  photo_data_url: string | null;
  status: "active" | "inactive";
  loginMode: "password" | "invite" | "none";
  password: string;
  confirm_password: string;
  students: ParentStudentLink[];
};

export const emptyParent: ParentFormValues = {
  parent_id: "", first_name: "", last_name: "", phone: "", alternate_phone: "",
  email: "", cnic: "", occupation: "", address: "", city: "",
  photo_data_url: null, status: "active",
  loginMode: "password", password: "", confirm_password: "",
  students: [],
};

const phoneRegex = /^[+0-9 \-()]{7,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateParent(v: ParentFormValues, opts: { requireLogin: boolean } = { requireLogin: true }): string | null {
  if (!v.parent_id.trim()) return "Parent ID is required.";
  if (!v.first_name.trim()) return "First name is required.";
  if (!v.last_name.trim()) return "Last name is required.";
  if (!phoneRegex.test(v.phone)) return "Valid primary mobile number is required.";
  if (v.alternate_phone && !phoneRegex.test(v.alternate_phone)) return "Alternate mobile number is invalid.";
  if (!emailRegex.test(v.email.trim())) return "Valid email address is required.";
  if (opts.requireLogin && v.loginMode === "password") {
    if (!v.password || v.password.length < 8) return "Password must be at least 8 characters.";
    if (v.password !== v.confirm_password) return "Passwords do not match.";
  }
  // primary guardian uniqueness per student
  const primaryByStudent = new Map<string, number>();
  for (const s of v.students) {
    if (!s.student_id) return "Each linked student must be selected.";
    if (s.is_primary) primaryByStudent.set(s.student_id, (primaryByStudent.get(s.student_id) ?? 0) + 1);
  }
  for (const [, n] of primaryByStudent) if (n > 1) return "Only one Primary Guardian per student.";
  return null;
}

export function parentFromRow(r: Record<string, unknown>): ParentFormValues {
  return {
    parent_id: String(r.parent_id ?? ""),
    first_name: String(r.first_name ?? ""),
    last_name: String(r.last_name ?? ""),
    phone: String(r.phone ?? ""),
    alternate_phone: String(r.alternate_phone ?? ""),
    email: String(r.email ?? ""),
    cnic: String(r.cnic ?? ""),
    occupation: String(r.occupation ?? ""),
    address: String(r.address ?? ""),
    city: String(r.city ?? ""),
    photo_data_url: (r.photo_url as string) ?? null,
    status: (r.status as "active" | "inactive") ?? "active",
    loginMode: "none",
    password: "",
    confirm_password: "",
    students: [],
  };
}

type StudentOpt = { id: string; full_name: string; admission_number: string | null };

export function ParentForm({
  value, onChange, mode = "create", students = [],
}: {
  value: ParentFormValues;
  onChange: (v: ParentFormValues) => void;
  mode?: "create" | "edit";
  students?: StudentOpt[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ParentFormValues>(k: K, v: ParentFormValues[K]) =>
    onChange({ ...value, [k]: v });

  const onPhoto = (file: File | null) => {
    if (!file) return;
    if (file.size > 700_000) { toast.error("Image too large (max ~700KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => set("photo_data_url", String(reader.result));
    reader.readAsDataURL(file);
  };

  const updateLink = (idx: number, patch: Partial<ParentStudentLink>) => {
    const next = value.students.slice();
    next[idx] = { ...next[idx], ...patch };
    if (patch.is_primary === true) {
      // enforce single primary per student locally
      const sid = next[idx].student_id;
      next.forEach((l, i) => { if (i !== idx && l.student_id === sid) l.is_primary = false; });
    }
    set("students", next);
  };
  const addLink = () => set("students", [...value.students, { student_id: "", relationship_type: "father", is_primary: false }]);
  const removeLink = (idx: number) => set("students", value.students.filter((_, i) => i !== idx));

  const usedIds = new Set(value.students.map((s) => s.student_id).filter(Boolean));

  return (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="basic">Basic</TabsTrigger>
        <TabsTrigger value="contact">Contact</TabsTrigger>
        <TabsTrigger value="students">Students</TabsTrigger>
        <TabsTrigger value="status">Status</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4 pt-4">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-muted">
            {value.photo_data_url ? <img src={value.photo_data_url} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Upload Photo
            </Button>
            {value.photo_data_url && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set("photo_data_url", null)}>Remove</Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FieldText label="Parent ID *" value={value.parent_id} onChange={(v) => set("parent_id", v)} />
          <FieldText label="CNIC / National ID" value={value.cnic} onChange={(v) => set("cnic", v)} />
          <FieldText label="First Name *" value={value.first_name} onChange={(v) => set("first_name", v)} />
          <FieldText label="Last Name *" value={value.last_name} onChange={(v) => set("last_name", v)} />
          <FieldText label="Occupation" value={value.occupation} onChange={(v) => set("occupation", v)} />
        </div>
      </TabsContent>

      <TabsContent value="contact" className="space-y-4 pt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FieldText label="Primary Mobile Number *" value={value.phone} onChange={(v) => set("phone", v)} />
          <FieldText label="Alternate Mobile Number" value={value.alternate_phone} onChange={(v) => set("alternate_phone", v)} />
          <FieldText label="Email Address *" value={value.email} onChange={(v) => set("email", v)} type="email" />
          <FieldText label="City" value={value.city} onChange={(v) => set("city", v)} />
        </div>

        {mode === "create" && (
          <>
            <div className="space-y-2">
              <Label>Login Provisioning</Label>
              <Select value={value.loginMode} onValueChange={(v) => set("loginMode", v as ParentFormValues["loginMode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Login (Add Later)</SelectItem>
                  <SelectItem value="password">Set Password Now</SelectItem>
                  <SelectItem value="invite">Send Invite Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.loginMode === "password" && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldText label="Password *" value={value.password} onChange={(v) => set("password", v)} type="password" />
                <FieldText label="Confirm Password *" value={value.confirm_password} onChange={(v) => set("confirm_password", v)} type="password" />
              </div>
            )}
          </>
        )}

        <div className="space-y-2">
          <Label>Residential Address</Label>
          <Textarea value={value.address} onChange={(e) => set("address", e.target.value)} rows={3} />
        </div>
      </TabsContent>

      <TabsContent value="students" className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Link one or more students to this parent.</p>
          <Button type="button" size="sm" variant="outline" onClick={addLink}>
            <Plus className="mr-1 h-4 w-4" /> Add Student
          </Button>
        </div>

        {value.students.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No students linked. Click "Add Student" to link one.
          </p>
        ) : (
          <div className="space-y-3">
            {value.students.map((link, idx) => {
              const opts = students.filter((s) => s.id === link.student_id || !usedIds.has(s.id));
              return (
                <div key={idx} className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 md:grid-cols-[2fr_1fr_auto_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs">Student *</Label>
                    <Select value={link.student_id || undefined} onValueChange={(v) => updateLink(idx, { student_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger>
                      <SelectContent>
                        {opts.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">No students available.</div>
                        ) : opts.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {titleCase(s.full_name)}{s.admission_number ? ` (#${s.admission_number})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Relationship *</Label>
                    <Select value={link.relationship_type}
                      onValueChange={(v) => updateLink(idx, { relationship_type: v as ParentRelationship })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PARENT_RELATIONSHIPS.map((r) => (
                          <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <Checkbox checked={link.is_primary} onCheckedChange={(c) => updateLink(idx, { is_primary: c === true })} />
                    Primary
                  </label>
                  <div className="flex items-end pb-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLink(idx)}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>

      <TabsContent value="status" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={value.status} onValueChange={(v) => set("status", v as "active" | "inactive")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function FieldText({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
