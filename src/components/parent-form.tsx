import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload } from "lucide-react";
import { toast } from "sonner";

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
};

export const emptyParent: ParentFormValues = {
  parent_id: "", first_name: "", last_name: "", phone: "", alternate_phone: "",
  email: "", cnic: "", occupation: "", address: "", city: "",
  photo_data_url: null, status: "active",
};

const phoneRegex = /^[+0-9 \-()]{7,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateParent(v: ParentFormValues): string | null {
  if (!v.parent_id.trim()) return "Parent ID is required.";
  if (!v.first_name.trim()) return "First name is required.";
  if (!v.last_name.trim()) return "Last name is required.";
  if (!phoneRegex.test(v.phone)) return "Valid primary mobile number is required.";
  if (v.alternate_phone && !phoneRegex.test(v.alternate_phone)) return "Alternate mobile number is invalid.";
  if (v.email && !emailRegex.test(v.email)) return "Email address is invalid.";
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
  };
}

export function ParentForm({
  value, onChange,
}: { value: ParentFormValues; onChange: (v: ParentFormValues) => void }) {
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

  return (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="basic">Basic</TabsTrigger>
        <TabsTrigger value="contact">Contact</TabsTrigger>
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
          <FieldText label="Email Address" value={value.email} onChange={(v) => set("email", v)} type="email" />
          <FieldText label="City" value={value.city} onChange={(v) => set("city", v)} />
        </div>
        <div className="space-y-2">
          <Label>Residential Address</Label>
          <Textarea value={value.address} onChange={(e) => set("address", e.target.value)} rows={3} />
        </div>
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
