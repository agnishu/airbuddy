import { Prose } from "@/components/Prose";

export const metadata = { title: "Privacy · Airbuddy" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy">
      <p>
        This is a starting draft for Airbuddy&apos;s privacy policy. Have it reviewed against India&apos;s Digital Personal Data
        Protection Act before public launch.
      </p>
      <h2>What we collect</h2>
      <p>
        Your name, photo and email from Google sign-in; your gender, if you choose to give it; and for each trip, your flight,
        address, and the time you want to travel.
      </p>
      <h2>What other riders see</h2>
      <p>
        Only your first name, photo, the area you&apos;re in, a rough distance (under 1 km or 1 to 2 km) and how far apart your
        times are. Never your address, email, phone number or gender.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Trips and chats are deleted 7 days after you travel, except messages attached to a safety report. Deleting your account
        removes your data within 30 days.
      </p>
      <h2>Who we share it with</h2>
      <p>
        Our service providers only: Supabase (database, in India), Vercel (hosting), Google (sign-in and address search) and our
        flight data provider. We don&apos;t sell your data.
      </p>
    </Prose>
  );
}
