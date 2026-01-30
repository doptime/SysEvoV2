import { TelemetryScope, useTrack } from '@/visual-telemetry/react/toolkit';

export const StartMenu = () => {
    return (
        // 1. 定义顶层作用域
        <TelemetryScope name="scene/intro/menu">
            <div className="flex flex-col gap-4">
                
                <button 
                    className="btn-primary"
                    // 2. 自动生成 ID: "scene/intro/menu/start_game"
                    // 3. 显式监视 opacity 变化 (因为有淡入动画)
                    {...useTrack('start_game', { watch: ['opacity'] })}
                >
                    Start Game
                </button>

                <button 
                    className="btn-secondary"
                    // 4. 自动生成 ID: "scene/intro/menu/settings"
                    {...useTrack('settings')}
                >
                    Settings
                </button>

            </div>
        </TelemetryScope>
    );
};