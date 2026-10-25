import { Prose } from "@/components/Prose";

export const metadata = { title: "Terms · Airbuddy" };

export default function TermsPage() {
  return (
    <Prose title="Terms">
      <p>This is a starting draft. Have it reviewed by a lawyer before public launch.</p>
      <h2>Airbuddy doesn&apos;t provide rides</h2>
      <p>
        Airbuddy helps travellers find each other. You book and pay for the cab yourselves, and you decide whether to share a
        ride. Airbuddy is not responsible for the ride itself.
      </p>
      <h2>Who can use it</h2>
      <p>You must be 18 or older and use your real name and photo.</p>
      <h2>Being a good buddy</h2>
      <p>
        Be on time, cancel early if your plans change, and treat other riders with respect. Riders reported by two different
        people are paused while we review the reports.
      </p>
      <h2>Donations</h2>
      <p>Airbuddy is free. Donations are optional, go towards running the service, and are not refundable.</p>
    </Prose>
  );
}
