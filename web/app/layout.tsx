import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
export const metadata:Metadata={title:"Ca làm & Bảng lương",description:"Quản lý ca làm, chấm công và tính lương F&B",manifest:"/manifest.json"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}<ServiceWorkerRegister/></body></html>}
