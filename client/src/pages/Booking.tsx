import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import * as z from "zod";
import { format, addDays, startOfToday, isSameDay } from "date-fns";
import { Calendar as CalendarIcon, Clock, CheckCircle2, User, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { bookingsApi } from "@/lib/api";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const bookingSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  company: z.string().optional(),
  details: z.string().min(10, "Please provide some context for our meeting."),
});

type BookingValues = z.infer<typeof bookingSchema>;

const generateAvailableTimes = () => {
  const times: Record<string, string[]> = {};
  const today = startOfToday();
  
  for (let i = 1; i <= 14; i++) {
    const date = addDays(today, i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const dateStr = date.toISOString();
    const slots = [];
    const hours = [9, 10, 11, 13, 14, 15, 16];
    
    for (const hour of hours) {
      if (Math.random() > 0.4) {
        slots.push(`${hour}:00`);
        if (Math.random() > 0.5) slots.push(`${hour}:15`);
        if (Math.random() > 0.5) slots.push(`${hour}:30`);
        if (Math.random() > 0.5) slots.push(`${hour}:45`);
      }
    }
    times[dateStr] = slots.sort();
  }
  return times;
};

const MOCK_AVAILABILITY = generateAvailableTimes();

export default function Booking() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isBooked, setIsBooked] = useState(false);

  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { name: "", email: "", company: "", details: "" },
  });

  const bookingMutation = useMutation({
    mutationFn: bookingsApi.create,
    onSuccess: () => setIsBooked(true),
  });

  const availableTimes = selectedDate 
    ? Object.entries(MOCK_AVAILABILITY).find(([dateStr]) => 
        isSameDay(new Date(dateStr), selectedDate)
      )?.[1] || []
    : [];

  const onSubmit = (data: BookingValues) => {
    if (!selectedDate || !selectedTime) return;
    bookingMutation.mutate({
      ...data,
      company: data.company || null,
      date: format(selectedDate, "yyyy-MM-dd"),
      time: selectedTime,
    });
  };

  const today = new Date();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 pt-32 pb-24 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-primary/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-accent/5 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="container mx-auto px-4 md:px-6 relative z-10 max-w-6xl">
          
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Architecture <span className="text-gradient">Consultation</span>.</h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Schedule a 45-minute technical discovery session. We'll discuss your infrastructure bottlenecks, automation needs, and potential microservice solutions.
            </p>
          </div>

          {isBooked ? (
            <div className="glass-panel rounded-3xl p-12 text-center animate-in fade-in zoom-in duration-500 max-w-2xl mx-auto">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-3xl font-display font-bold mb-4">Session Confirmed</h2>
              <p className="text-muted-foreground mb-8">
                Your architecture consultation is scheduled for{" "}
                <span className="text-foreground font-medium">
                  {selectedDate && format(selectedDate, "EEEE, MMMM do, yyyy")} at {selectedTime}
                </span>. 
                A calendar invitation with the meeting link has been sent to your email.
              </p>
              <div className="bg-secondary/50 rounded-xl p-6 mb-8 text-left border border-white/5">
                <h3 className="font-medium mb-2 text-sm text-muted-foreground uppercase tracking-wider">Preparation Checklist</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>Gather current API documentation or Swagger specs</li>
                  <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>Compile a list of active integrations (Stripe, Auth0, etc.)</li>
                  <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>Note current infrastructure costs for ROI analysis</li>
                </ul>
              </div>
              <Button onClick={() => window.location.href = "/"} variant="outline" className="border-white/10 hover:bg-white/5">
                Return to Dashboard
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
              
              <div className="lg:col-span-7 flex flex-col gap-6">
                <div className="glass-panel rounded-2xl p-6">
                  <h3 className="text-xl font-display font-semibold mb-6 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                    Select a Date
                  </h3>
                  <div className="flex justify-center border border-white/5 rounded-xl p-4 bg-background/50">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setSelectedTime(null);
                      }}
                      disabled={(date) => 
                        date < today || 
                        date.getDay() === 0 || 
                        date.getDay() === 6 ||
                        date > addDays(today, 30)
                      }
                      className="bg-transparent"
                    />
                  </div>
                </div>

                {selectedDate && (
                  <div className="glass-panel rounded-2xl p-6 animate-in slide-in-from-top-4 fade-in duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-display font-semibold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-accent" />
                        Available Times
                      </h3>
                      <span className="text-sm text-muted-foreground">
                        {format(selectedDate, "MMM do, yyyy")}
                      </span>
                    </div>

                    {availableTimes.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {availableTimes.map((time) => (
                          <Button
                            key={time}
                            variant={selectedTime === time ? "default" : "outline"}
                            className={`
                              font-mono text-sm border-white/10
                              ${selectedTime === time ? 'bg-accent hover:bg-accent/90 shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'hover:bg-accent/20 hover:text-accent hover:border-accent/50'}
                            `}
                            onClick={() => setSelectedTime(time)}
                            data-testid={`btn-time-${time}`}
                          >
                            {time}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground bg-background/50 rounded-xl border border-white/5">
                        No available slots for this date. Please select another.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="lg:col-span-5">
                <div className={`glass-panel rounded-2xl p-6 md:p-8 transition-opacity duration-300 ${(!selectedDate || !selectedTime) ? 'opacity-50 pointer-events-none' : 'opacity-100 shadow-[0_0_30px_rgba(59,130,246,0.1)]'}`}>
                  <div className="mb-6 pb-6 border-b border-white/5">
                    <h3 className="text-xl font-display font-semibold mb-2">Meeting Details</h3>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {selectedDate && selectedTime ? (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          {format(selectedDate, "MMM do")} at {selectedTime}
                        </Badge>
                      ) : (
                        <span className="italic">Please select a date and time first</span>
                      )}
                      <Badge variant="outline" className="bg-secondary text-secondary-foreground border-white/10">45 Minutes</Badge>
                      <Badge variant="outline" className="bg-secondary text-secondary-foreground border-white/10">Video Call</Badge>
                    </div>
                  </div>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Full Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Jane Doe" className="bg-background/50 border-white/10 focus-visible:border-primary" data-testid="input-name" {...field} />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Work Email</FormLabel>
                            <FormControl>
                              <Input placeholder="jane@company.com" className="bg-background/50 border-white/10 focus-visible:border-primary" data-testid="input-email" {...field} />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="company"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80">Company (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Acme Corp" className="bg-background/50 border-white/10 focus-visible:border-primary" data-testid="input-company" {...field} />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="details"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground/80 flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Project Context</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Briefly describe your current architecture or the specific automation needs..." className="resize-none min-h-[120px] bg-background/50 border-white/10 focus-visible:border-primary" data-testid="input-details" {...field} />
                            </FormControl>
                            <FormMessage className="text-red-400" />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        className="w-full h-12 text-base font-medium shadow-[0_0_20px_rgba(59,130,246,0.2)] mt-4"
                        disabled={!selectedDate || !selectedTime || bookingMutation.isPending}
                        data-testid="button-submit-booking"
                      >
                        {bookingMutation.isPending ? "Confirming..." : "Confirm Consultation"}
                      </Button>
                      {bookingMutation.isError && (
                        <p className="text-sm text-red-400 text-center">Something went wrong. Please try again.</p>
                      )}
                    </form>
                  </Form>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}