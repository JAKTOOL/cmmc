import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

const geistSans = localFont({
    src: "./fonts/GeistVF.woff",
    variable: "--font-geist-sans",
    weight: "100 900",
});
const geistMono = localFont({
    src: "./fonts/GeistMonoVF.woff",
    variable: "--font-geist-mono",
    weight: "100 900",
});

export const metadata: Metadata = {
    title: "CMMC | SP NIST 800-171 Rev 3",
    description:
        "This application simplifies achieving NIST SP 800-171 Revision 3 compliance by providing a user-friendly interface to manage security controls, store data locally, and generate compliance summaries. ",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <meta
                    http-equiv="Content-Security-Policy"
                    content="default-src 'self'; script-src 'unsafe-inline'"
                />
                <Script
                    src={`/service-worker.js?v=${process.env.NEXT_PUBLIC_FRAMEWORK_VERSION}`}
                    async
                />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                {children}
            </body>
        </html>
    );
}
