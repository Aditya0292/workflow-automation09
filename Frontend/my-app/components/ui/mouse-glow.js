'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function MouseGlow() {
    const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });

    useEffect(() => {
        const updateMousePosition = (e) => {
            setMousePosition({
                x: (e.clientX / window.innerWidth) * 100,
                y: (e.clientY / window.innerHeight) * 100,
            });
        };

        window.addEventListener('mousemove', updateMousePosition);
        return () => window.removeEventListener('mousemove', updateMousePosition);
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Main glow that follows cursor - Emerald primary */}
            <motion.div
                className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-25"
                style={{
                    background: 'radial-gradient(circle, rgba(16,185,129,0.4) 0%, rgba(5,150,105,0.25) 40%, transparent 70%)',
                    transform: 'translate(-50%, -50%)',
                }}
                animate={{
                    left: `${mousePosition.x}%`,
                    top: `${mousePosition.y}%`,
                }}
                transition={{
                    type: 'spring',
                    damping: 30,
                    stiffness: 100,
                    mass: 0.8,
                }}
            />

            {/* Secondary delayed glow - Emerald dark */}
            <motion.div
                className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-15"
                style={{
                    background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(6,78,59,0.2) 50%, transparent 70%)',
                    transform: 'translate(-50%, -50%)',
                }}
                animate={{
                    left: `${mousePosition.x}%`,
                    top: `${mousePosition.y}%`,
                }}
                transition={{
                    type: 'spring',
                    damping: 25,
                    stiffness: 80,
                    mass: 1.2,
                }}
            />

            {/* Subtle trailing glow */}
            <motion.div
                className="absolute w-[400px] h-[400px] rounded-full blur-[80px] opacity-10"
                style={{
                    background: 'radial-gradient(circle, rgba(52,211,153,0.25) 0%, rgba(16,185,129,0.1) 50%, transparent 60%)',
                    transform: 'translate(-50%, -50%)',
                }}
                animate={{
                    left: `${mousePosition.x}%`,
                    top: `${mousePosition.y}%`,
                }}
                transition={{
                    type: 'spring',
                    damping: 20,
                    stiffness: 60,
                    mass: 1.5,
                }}
            />
        </div>
    );
}
