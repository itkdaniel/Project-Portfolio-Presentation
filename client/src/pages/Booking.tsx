import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import * as z from "zod";
import { format, addDays, startOfToday, isSameDay, isWeekend, isPast } from "date-fns";
import {
  CalendarIcon, Clock, CheckCircle2, User, Mail, MessageSquare,
  Building2, ChevronRight, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { bookingsApi } from "@/lib/api";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const bookingSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  company: z.string().optional(),
  meetingType: z.string().min(1, "Please select a meeting type."),
  details: z.string().min(10, "Please provide at least 10 characters of context."),
});

type BookingValues = z.infer<typeof bookingSchema>;

const MEETING_TYPES = [
  { value: "discovery", label: "Technical Discovery Call" },
  { value: "architecture", label: "Architecture Review" },
  { value: "microservices", label: "Microservices Consultation" },
  { value: "automation", label: "Automation Strategy" },
  { value: "devops", label: "DevOps & CI/CD Pipeline Review" },
  { value: "ai", label: "AI/ML Integration Planning" },
];

// Generate stable availability for the next 14 weekdays using a seeded pattern
function buildAvailability(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const today = startOfToday();
  const allSlots = ["9:00","9:15","9:30","9:45","10:00","10:15","10:30","10:45","11:00","11:15","11:30","11:45","13:00","13:15","13:30","13:45","14:00","14:15","14:30","14:45","15:00","15:15","15:30","15:45","16:00","16:15","16:30","16:45"];

  // Deterministic availability pattern: every weekday within next 14 days gets most slots
  // a few slots blocked per day for realism (based on day-of-week)
  const blockedByDow: Record<number, number[]> = {
    1: [0, 5, 12, 18],      // Monday: block a few morning + afternoon
    2: [2, 7, 14, 22],      // Tuesday
    3: [1, 8, 15, 20, 25],  // Wednesday - busier
    4: [3, 6, 13, 21],      // Thursday
    5: [0, 1, 4, 16, 24],   // Friday - block some early + late
  };

  for (let i = 1; i <= 21; i++) {
    const date = addDays(today, i);
    if (isWeekend(date) || date > addDays(today, 30)) continue;
    const key = format(date, "yyyy-MM-dd");
    const dow = date.getDay();
    const blocked = new Set(blockedByDow[dow] || []);
    map.set(key, allSlots.filter((_, idx) => !blocked.has(idx)));
  }
  return map;
}

const AVAILABILITY = buildAvailability();

const STEPS = ["Date", "Time", "Details", "Confirm"];

const SESSION_KEY = "nexus_booking_wizard";

function loadSession(): { step: number; date: string | null; time: string | null } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { step: 0, date: null, time: null };
}

function saveSession(step: number, date: Date | undefined, time: string | null) {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ step, date: date ? format(date, "yyyy-MM-dd") : null, time })
    );
  } catch {}
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export default function Booking() {
  const saved = loadSession();

  const [step, setStep] = useState<number>(saved.step);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    saved.date ? new Date(saved.date + "T12:00:00") : undefined
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(saved.time);
  const [isBooked, setIsBooked] = useState(false);

  useEffect(() => {
    saveSession(step, selectedDate, selectedTime);
  }, [step, selectedDate, selectedTime]);

  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { name: "", email: "", company: "", meetingType: "", details: "" },
    mode: "onChange",
  });

  const bookingMutation = useMutation({
    mutationFn: bookingsApi.create,
    onSuccess: () => {
      clearSession();
      setIsBooked(true);
    },
  });

  const dateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const availableTimes = dateKey ? (AVAILABILITY.get(dateKey) || []) : [];

  // Dates that have ANY availability highlighted differently
  const availableDates = useMemo(() => {
    const dates: Date[] = [];
    AVAILABILITY.forEach((_, key) => dates.push(new Date(key + "T12:00:00")));
    return dates;
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const onSubmit = (data: BookingValues) => {
    if (!selectedDate || !selectedTime) return;
    bookingMutation.mutate({
      ...data,
      company: data.company || null,
      date: format(selectedDate, "yyyy-MM-dd"),
      time: selectedTime,
    });
  };

  // Slot coloring: morning = blue, afternoon = purple, evening = green
  const getSlotColor = (time: string) => {
    const hour = parseInt(time.split(":")[0]);
    if (hour < 12) return "morning";
    if (hour < 15) return "afternoon";
    return "late";
  };

  const slotClasses: Record<string, string> = {
    morning:   "border-blue-500/30 hover:bg-blue-500/20 hover:text-blue-300 hover:border-blue-400/60",
    afternoon: "border-accent/30 hover:bg-accent/20 hover:text-accent hover:border-accent/60",
    late:      "border-green-500/30 hover:bg-green-500/20 hover:text-green-300 hover:border-green-400/60",
  };

  const selectedSlotClasses: Record<string, string> = {
    morning:   "bg-blue-500/30 text-blue-200 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.4)]",
    afternoon: "bg-accent/30 text-accent-foreground border-accent shadow-[0_0_12px_rgba(147,51,234,0.4)]",
    late:      "bg-green-500/30 text-green-200 border-green-400 shadow-[0_0_12px_rgba(34,197,94,0.4)]",
  };

  if (isBooked) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 pt-32 pb-24 flex items-center justify-center">
          <div className="glass-panel rounded-3xl p-12 text-center animate-in fade-in zoom-in duration-500 max-w-2xl mx-auto mx-4">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-3xl font-display font-bold mb-4">Session Confirmed</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Your <span className="text-foreground font-medium">{MEETING_TYPES.find(m => m.value === form.getValues("meetingType"))?.label}</span> is scheduled for{" "}
              <span className="text-foreground font-medium">
                {selectedDate && format(selectedDate, "EEEE, MMMM do, yyyy")} at {selectedTime}
              </span>.{" "}
              A calendar invitation will be sent to <span className="text-primary font-medium">{form.getValues("email")}</span>.
            </p>
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { label: "Date", val: selectedDate ? format(selectedDate, "MMM do") : "" },
                { label: "Time", val: selectedTime || "" },
                { label: "Duration", val: "45 min" },
              ].map(item => (
                <div key={item.label} className="bg-secondary/50 rounded-xl p-4 border border-white/5">
                  <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                  <div className="font-mono font-medium text-primary">{item.val}</div>
                </div>
              ))}
            </div>
            <div className="bg-secondary/30 rounded-xl p-5 mb-8 text-left border border-white/5">
              <h3 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Info className="w-3.5 h-3.5" /> Preparation Checklist
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {["Current API docs or Swagger/OpenAPI specs", "List of active integrations and third-party services", "Infrastructure cost breakdown for ROI analysis", "Any existing architecture diagrams"].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0"></div>{item}
                  </li>
                ))}
              </ul>
            </div>
            <Button onClick={() => window.location.href = "/"} variant="outline" className="border-white/10 hover:bg-white/5">
              Return Home
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-28 pb-24 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-primary/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-accent/5 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="container mx-auto px-4 md:px-6 relative z-10 max-w-5xl">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">
              Book a <span className="text-gradient">Consultation</span>.
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl">
              Schedule a 45-minute technical discovery session with our architecture team.
            </p>
          </div>

          {/* Step Progress */}
          <div className="flex items-center gap-2 mb-10">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all duration-300 ${
                  i === step ? "bg-primary/20 text-primary border-primary/40 shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                  : i < step ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "text-muted-foreground border-white/10"
                }`}>
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-mono ${
                    i < step ? "bg-green-500/20 text-green-400" : i === step ? "bg-primary/20 text-primary" : "bg-secondary"
                  }`}>
                    {i < step ? "✓" : i + 1}
                  </span>
                  {s}
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/40" />}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-6 text-xs font-mono">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-400/60"></span><span className="text-muted-foreground">Morning (9AM–12PM)</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-accent/30 border border-accent/60"></span><span className="text-muted-foreground">Afternoon (1PM–3PM)</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-green-500/30 border border-green-400/60"></span><span className="text-muted-foreground">Late (3PM–5PM)</span></div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

            {/* Left: Calendar + Time Slots */}
            <div className="lg:col-span-3 flex flex-col gap-6">

              {/* Step 0: Date Picker */}
              <div className={`glass-panel rounded-2xl p-6 transition-all duration-300 ${step === 0 ? "ring-1 ring-primary/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : ""}`}>
                <h3 className="text-lg font-display font-semibold mb-5 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  Step 1 — Select a Date
                </h3>

                <div className="flex justify-center bg-background/50 rounded-xl border border-white/5 p-4">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setSelectedTime(null);
                      if (date) setStep(1);
                    }}
                    disabled={(date) => {
                      const d = new Date(date);
                      d.setHours(0, 0, 0, 0);
                      return d <= today || isWeekend(date) || date > addDays(today, 30);
                    }}
                    className="w-full bg-transparent"
                    data-testid="calendar-date-picker"
                  />
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs font-mono text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary/60"></span> Selected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent/40"></span> Today
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30"></span> Unavailable
                  </span>
                </div>
              </div>

              {/* Step 1: Time Slots */}
              {selectedDate && (
                <div className={`glass-panel rounded-2xl p-6 animate-in slide-in-from-top-4 fade-in duration-300 transition-all ${step === 1 ? "ring-1 ring-accent/30 shadow-[0_0_20px_rgba(147,51,234,0.1)]" : ""}`}>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-accent" />
                      Step 2 — Select a Time
                    </h3>
                    <span className="text-sm text-muted-foreground font-mono">
                      {format(selectedDate, "EEE, MMM do")}
                    </span>
                  </div>

                  {availableTimes.length > 0 ? (
                    <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                      {availableTimes.map((time) => {
                        const color = getSlotColor(time);
                        const isSelected = selectedTime === time;
                        return (
                          <button
                            key={time}
                            onClick={() => {
                              setSelectedTime(time);
                              setStep(2);
                            }}
                            data-testid={`btn-time-${time.replace(":", "-")}`}
                            className={`
                              py-2 px-1 rounded-lg border text-xs font-mono transition-all duration-200
                              ${isSelected ? selectedSlotClasses[color] : `bg-transparent text-muted-foreground ${slotClasses[color]}`}
                            `}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-muted-foreground bg-background/50 rounded-xl border border-white/5">
                      No slots available for this date. Please pick another day.
                    </div>
                  )}

                  <p className="mt-4 text-xs text-muted-foreground">All times are in your local timezone. Sessions are 45 minutes.</p>
                </div>
              )}
            </div>

            {/* Right: Details Form */}
            <div className="lg:col-span-2">
              <div className={`glass-panel rounded-2xl p-6 md:p-8 transition-all duration-500 ${
                step < 2 ? "opacity-40 pointer-events-none" : "opacity-100"
              } ${step === 2 || step === 3 ? "ring-1 ring-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.05)]" : ""}`}>

                {/* Summary chips */}
                <div className="mb-6 pb-5 border-b border-white/5">
                  <h3 className="text-lg font-display font-semibold mb-3">Step 3 — Your Details</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedDate ? (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-mono text-xs" data-testid="badge-selected-date">
                        {format(selectedDate, "MMM do, yyyy")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground border-white/10 text-xs italic" data-testid="badge-selected-date">No date</Badge>
                    )}
                    {selectedTime ? (
                      <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 font-mono text-xs">
                        {selectedTime}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground border-white/10 text-xs italic">No time</Badge>
                    )}
                    <Badge variant="outline" className="bg-secondary text-muted-foreground border-white/10 text-xs">45 min · Video</Badge>
                  </div>
                </div>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/80 text-sm flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-primary" /> Full Name *
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Jane Doe"
                            className={`bg-background/50 border-white/10 h-10 focus-visible:ring-0 focus-visible:border-primary transition-colors ${form.formState.errors.name ? "border-red-500/60" : form.watch("name")?.length >= 2 ? "border-green-500/40" : ""}`}
                            data-testid="input-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/80 text-sm flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-primary" /> Work Email *
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="jane@company.com"
                            type="email"
                            className={`bg-background/50 border-white/10 h-10 focus-visible:ring-0 focus-visible:border-primary transition-colors ${form.formState.errors.email ? "border-red-500/60" : form.watch("email") && !form.formState.errors.email ? "border-green-500/40" : ""}`}
                            data-testid="input-email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="company" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/80 text-sm flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Company
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Acme Corp (optional)"
                            className="bg-background/50 border-white/10 h-10 focus-visible:ring-0 focus-visible:border-primary"
                            data-testid="input-company"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="meetingType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/80 text-sm flex items-center gap-1.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-accent" /> Session Type *
                        </FormLabel>
                        <Select onValueChange={(v) => { field.onChange(v); }} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger
                              className={`bg-background/50 border-white/10 h-10 focus:ring-0 transition-colors ${form.formState.errors.meetingType ? "border-red-500/60" : field.value ? "border-green-500/40" : ""}`}
                              data-testid="select-meeting-type"
                            >
                              <SelectValue placeholder="Choose a session type..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {MEETING_TYPES.map(m => (
                              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400 text-xs" />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="details" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/80 text-sm flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-green-400" /> Project Context *
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your current architecture, specific pain points, or automation goals..."
                            className={`resize-none min-h-[100px] bg-background/50 border-white/10 focus-visible:ring-0 focus-visible:border-primary transition-colors text-sm ${form.formState.errors.details ? "border-red-500/60" : form.watch("details")?.length >= 10 ? "border-green-500/40" : ""}`}
                            data-testid="input-details"
                            {...field}
                          />
                        </FormControl>
                        <div className="flex justify-between">
                          <FormMessage className="text-red-400 text-xs" />
                          <span className={`text-xs font-mono ${form.watch("details")?.length >= 10 ? "text-green-400" : "text-muted-foreground"}`}>
                            {form.watch("details")?.length || 0} / 10 min
                          </span>
                        </div>
                      </FormItem>
                    )} />

                    <Button
                      type="submit"
                      className="w-full h-11 font-medium shadow-[0_0_20px_rgba(59,130,246,0.2)] mt-2"
                      disabled={!selectedDate || !selectedTime || bookingMutation.isPending}
                      data-testid="button-submit-booking"
                    >
                      {bookingMutation.isPending ? "Confirming..." : "Confirm Consultation →"}
                    </Button>

                    {bookingMutation.isError && (
                      <p className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                        Something went wrong. Please try again.
                      </p>
                    )}
                  </form>
                </Form>
              </div>
            </div>

          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}