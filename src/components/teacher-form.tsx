import { EMAIL_REGEX, cnicError } from "@/lib/validators";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";

export type TeacherFormValues = {
  employee_id: string;
  first_name: string;
  last_name: string;
  gender: "" | "male" | "female" | "other";
  date_of_birth: string;
  cnic: string;
  photo_data_url: string | null;
  phone: string;
  email: string;
  password: string;
  confirm_password: string;
  address: string;
  joining_date: string;
  designation: string;
  department: string;
  status: "active" | "inactive";
  subject: string;
  loginMode: "password" | "invite" | "none";
};

export const emptyTeacher: TeacherFormValues = {
  employee_id: "", first_name: "", last_name: "", gender: "",
  date_of_birth: "", cnic: "", photo_data_url: null,
  phone: "", email: "", password: "", confirm_password: "",
  address: "", joining_date: "", designation: "", department: "",
  status: "active", subject: "", loginMode: "none",
};

export function validateTeacher(v: TeacherFormValues, opts: { requireLogin: boolean }): string | null {
  if (!v.first_name.trim()) return "First name is required.";
  if (!v.last_name.trim()) return "Last name is required.";
  if (!/^[0-9-]{6,15}$/.test(v.cnic.trim())) return "CNIC is required (digits and dashes).";
  if (!/^[+0-9 \-()]{7,20}$/.test(v.phone.trim())) return "Valid mobile number is required.";
  if (!EMAIL_REGEX.test(v.email.trim())) return "Please enter a valid email address (e.g., name@example.com).";
  if (!v.joining_date) return "Joining date is required.";
  if (!v.designation.trim()) return "Designation is required.";
  if (!v.department.trim()) return "Department is required.";
  if (opts.requireLogin && v.loginMode === "password") {
    if (!v.password || v.password.length < 8) return "Password must be at least 8 characters.";
    if (v.password !== v.confirm_password) return "Passwords do not match.";
  }
  return null;
}

export function TeacherForm({
  value, onChange, mode = "create",
}: {
  value: TeacherFormValues;
  onChange: (v: TeacherFormValues) => void;
  mode?: "create" | "edit";
}) {
  const set = <K extends keyof TeacherFormValues>(k: K, val: TeacherFormValues[K]) =>
    onChange({ ...value, [k]: val });

  const [tab, setTab] = useState("basic");

  const onPhoto = async (file: File) => {
    if (file.size > 900_000) { toast.error("Image too large (max ~900 KB)."); return; }
    const reader = new FileReader();
    reader.onload = () => set("photo_data_url", String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="basic">Basic</TabsTrigger>
        <TabsTrigger value="contact">Contact</TabsTrigger>
        <TabsTrigger value="employment">Employment</TabsTrigger>
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
              <Upload className="h-3.5 w-3.5" /> Upload photo
            </span>
          </label>
          {value.photo_data_url && (
            <Button type="button" size="sm" variant="ghost" onClick={() => set("photo_data_url", null)}>Remove</Button>
          )}
        </div>
        <Field label="Employee ID"><Input value={value.employee_id} onChange={(e) => set("employee_id", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name *"><Input value={value.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
          <Field label="Last name *"><Input value={value.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gender">
            <Select value={value.gender || undefined} onValueChange={(v) => set("gender", v as TeacherFormValues["gender"])}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date Of Birth"><Input type="date" value={value.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
        </div>
        <Field label="CNIC / National ID *"><Input value={value.cnic} maxLength={15} onChange={(e) => set("cnic", e.target.value)} placeholder="*****-*******-*" /></Field>
      </TabsContent>

      <TabsContent value="contact" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile number *"><Input value={value.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email address *"><Input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} /></Field>
        </div>
        {mode === "create" && (
          <>
            <Field label="Login provisioning">
              <Select value={value.loginMode} onValueChange={(v) => set("loginMode", v as TeacherFormValues["loginMode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No login (add later)</SelectItem>
                  <SelectItem value="password">Set password now</SelectItem>
                  <SelectItem value="invite">Send invite email</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {value.loginMode === "password" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Password *"><PasswordInput value={value.password} onChange={(e) => set("password", e.target.value)} /></Field>
                  <Field label="Confirm password *"><PasswordInput value={value.confirm_password} onChange={(e) => set("confirm_password", e.target.value)} /></Field>
                </div>
                {value.confirm_password && value.confirm_password !== value.password && (
                  <p className="text-xs font-medium text-destructive">Password Mismatch</p>
                )}
              </>
            )}
          </>
        )}
        <Field label="Residential address">
          <Textarea rows={3} value={value.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
      </TabsContent>

      <TabsContent value="employment" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Joining Date *"><Input type="date" value={value.joining_date} onChange={(e) => set("joining_date", e.target.value)} /></Field>
          <Field label="Status">
            <Select value={value.status} onValueChange={(v) => set("status", v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Designation *"><Input value={value.designation} onChange={(e) => set("designation", e.target.value)} placeholder="e.g. Senior Teacher" /></Field>
          <Field label="Department *"><Input value={value.department} onChange={(e) => {
            const department = e.target.value;
            onChange({ ...value, department, subject: !value.subject.trim() || value.subject.trim().toLowerCase() === value.department.trim().toLowerCase() ? department : value.subject });
          }} placeholder="e.g. Science" /></Field>
        </div>
        <Field label="Primary subject"><Input value={value.subject} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Mathematics" /></Field>
      </TabsContent>
    </Tabs>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

export function teacherFromRow(row: Record<string, unknown>): TeacherFormValues {
  return {
    ...emptyTeacher,
    employee_id: (row.employee_id as string) ?? "",
    first_name: (row.first_name as string) ?? "",
    last_name: (row.last_name as string) ?? "",
    gender: ((row.gender as string) ?? "") as TeacherFormValues["gender"],
    date_of_birth: (row.date_of_birth as string) ?? "",
    cnic: (row.cnic as string) ?? "",
    photo_data_url: (row.photo_url as string) ?? null,
    phone: (row.phone as string) ?? "",
    email: (row.email as string) ?? "",
    address: (row.address as string) ?? "",
    joining_date: (row.joining_date as string) ?? "",
    designation: (row.designation as string) ?? "",
    department: (row.department as string) ?? "",
    status: ((row.status as string) ?? "active") as "active" | "inactive",
    subject: (row.subject as string) ?? "",
  };
}

