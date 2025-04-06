"use client";
import React from "react";
//import React, { Suspense } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
//import AuthProvider from "./AuthProvider";

function Provider({ children }) {
    const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);
    //console.log("Convex URL:", process.env.NEXT_PUBLIC_CONVEX_URL);

    return (
        <div>
            <ConvexProvider client={convex}>
                {children}
            </ConvexProvider>
        </div>

    );
}

export default Provider;
/*        <Suspense fallback={<p>Loading...</p>}>
            <ConvexProvider client={convex}>
                <AuthProvider>
                    {children}
                </AuthProvider>   
            </ConvexProvider>
        </Suspense>*/