import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

// Server configuration
const SERVER_NAME = 'mcp-server-251215'
const SERVER_VERSION = '1.0.0'

// Configuration schema for Smithery
export const configSchema = z.object({
    hfToken: z
        .string()
        .optional()
        .describe('Hugging Face API Token (이미지 생성 기능에 필요)')
})

// Config type
type Config = z.infer<typeof configSchema>

// Helper function to create text response
const createTextResponse = (text: string) => ({
    content: [{ type: 'text' as const, text }],
    structuredContent: {
        content: [{ type: 'text' as const, text }]
    }
})

// Weather code descriptions
const WEATHER_CODES: Record<number, string> = {
    0: '맑음',
    1: '대체로 맑음',
    2: '부분적으로 흐림',
    3: '흐림',
    45: '안개',
    48: '서리 안개',
    51: '약한 이슬비',
    53: '중간 이슬비',
    55: '강한 이슬비',
    56: '약한 동결 이슬비',
    57: '강한 동결 이슬비',
    61: '약한 비',
    63: '중간 비',
    65: '강한 비',
    66: '약한 동결 비',
    67: '강한 동결 비',
    71: '약한 눈',
    73: '중간 눈',
    75: '강한 눈',
    77: '눈알',
    80: '약한 소나기',
    81: '중간 소나기',
    82: '강한 소나기',
    85: '약한 눈 소나기',
    86: '강한 눈 소나기',
    95: '천둥번개',
    96: '천둥번개와 약한 우박',
    99: '천둥번개와 강한 우박'
}

const getWeatherDescription = (code: number): string =>
    WEATHER_CODES[code] || `코드 ${code}`

// Required: Export default createServer function for Smithery
export default function createServer({ config }: { config: Config }) {
    const server = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION
    })

    // Hugging Face Inference Client (config에서 토큰 가져오기)
    const hfToken = config?.hfToken || process.env.HF_TOKEN
    const hfClient = hfToken ? new InferenceClient(hfToken) : null

    // 인사말 도구
    server.registerTool(
        'greet',
        {
            description: '이름과 언어를 입력하면 인사말을 반환합니다.',
            inputSchema: z.object({
                name: z.string().describe('인사할 사람의 이름'),
                language: z
                    .enum(['ko', 'en'])
                    .optional()
                    .default('en')
                    .describe('인사 언어 (기본값: en)')
            })
        },
        async ({ name, language }) => {
            const greeting =
                language === 'ko'
                    ? `안녕하세요, ${name}님!`
                    : `Hey there, ${name}! 👋 Nice to meet you!`

            return createTextResponse(greeting)
        }
    )

    // 계산기 도구
    server.registerTool(
        'calculator',
        {
            description: '두 개의 숫자와 연산자를 입력받아 사칙연산 결과를 반환합니다.',
            inputSchema: z.object({
                num1: z.number().describe('첫 번째 숫자'),
                num2: z.number().describe('두 번째 숫자'),
                operator: z
                    .enum(['+', '-', '*', '/'])
                    .describe('연산자 (+, -, *, /)')
            })
        },
        async ({ num1, num2, operator }) => {
            let result: number = 0
            let resultText: string = ''

            switch (operator) {
                case '+':
                    result = num1 + num2
                    resultText = `${num1} + ${num2} = ${result}`
                    break
                case '-':
                    result = num1 - num2
                    resultText = `${num1} - ${num2} = ${result}`
                    break
                case '*':
                    result = num1 * num2
                    resultText = `${num1} * ${num2} = ${result}`
                    break
                case '/':
                    if (num2 === 0) {
                        resultText = '오류: 0으로 나눌 수 없습니다.'
                    } else {
                        result = num1 / num2
                        resultText = `${num1} / ${num2} = ${result}`
                    }
                    break
            }

            return createTextResponse(resultText)
        }
    )

    // 시간 조회 도구
    server.registerTool(
        'get-time',
        {
            description: '타임존을 입력받아 해당 타임존의 현재 시간을 반환합니다.',
            inputSchema: z.object({
                timezone: z
                    .string()
                    .describe('IANA 타임존 이름 (예: Asia/Seoul, America/New_York, Europe/London)')
            })
        },
        async ({ timezone }) => {
            try {
                const now = new Date()
                const formatter = new Intl.DateTimeFormat('ko-KR', {
                    timeZone: timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })

                const formattedTime = formatter.format(now)
                return createTextResponse(`${timezone}의 현재 시간: ${formattedTime}`)
            } catch (error) {
                return createTextResponse(`오류: 유효하지 않은 타임존입니다. (${timezone})`)
            }
        }
    )

    // 지오코딩 도구
    server.registerTool(
        'geocode',
        {
            description: '도시 이름이나 주소를 입력받아 위도와 경도 좌표를 반환합니다.',
            inputSchema: z.object({
                address: z
                    .string()
                    .describe('도시 이름 또는 주소 (예: "Seoul", "New York", "서울시 강남구")')
            })
        },
        async ({ address }) => {
            try {
                const encodedAddress = encodeURIComponent(address)
                const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=jsonv2&limit=1&addressdetails=1`

                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'MCP-Geocode-Tool/1.0'
                    }
                })

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`)
                }

                const data = await response.json()

                if (!Array.isArray(data) || data.length === 0) {
                    return createTextResponse(`주소를 찾을 수 없습니다: ${address}`)
                }

                const result = data[0]
                const lat = parseFloat(result.lat)
                const lon = parseFloat(result.lon)
                const displayName = result.display_name || address

                return createTextResponse(
                    `주소: ${displayName}\n위도: ${lat}\n경도: ${lon}\n좌표: (${lat}, ${lon})`
                )
            } catch (error) {
                return createTextResponse(
                    `오류: 주소를 조회하는 중 문제가 발생했습니다. ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    )

    // 날씨 조회 도구
    server.registerTool(
        'get-weather',
        {
            description: '위도와 경도 좌표, 예보 기간을 입력받아 해당 위치의 현재 날씨와 예보 정보를 제공합니다.',
            inputSchema: z.object({
                latitude: z
                    .number()
                    .min(-90)
                    .max(90)
                    .describe('위도 좌표 (-90 ~ 90)'),
                longitude: z
                    .number()
                    .min(-180)
                    .max(180)
                    .describe('경도 좌표 (-180 ~ 180)'),
                forecastDays: z
                    .number()
                    .int()
                    .min(1)
                    .max(16)
                    .optional()
                    .default(7)
                    .describe('예보 기간 (일 단위, 1~16일, 기본값: 7일)')
            })
        },
        async ({ latitude, longitude, forecastDays = 7 }) => {
            try {
                const url = new URL('https://api.open-meteo.com/v1/forecast')
                url.searchParams.set('latitude', latitude.toString())
                url.searchParams.set('longitude', longitude.toString())
                url.searchParams.set('current_weather', 'true')
                url.searchParams.set('hourly', 'temperature_2m,precipitation,wind_speed_10m,weather_code')
                url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code')
                url.searchParams.set('forecast_days', forecastDays.toString())
                url.searchParams.set('timezone', 'auto')

                const response = await fetch(url.toString())

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`)
                }

                const data = await response.json()

                const current = data.current_weather
                const daily = data.daily

                let resultText = `📍 위치: 위도 ${latitude}, 경도 ${longitude}\n\n`
                resultText += `🌡️ 현재 날씨:\n`
                resultText += `  온도: ${current.temperature}°C\n`
                resultText += `  날씨: ${getWeatherDescription(current.weathercode)}\n`
                resultText += `  풍속: ${current.windspeed} km/h\n\n`

                resultText += `📅 ${forecastDays}일 예보:\n`
                for (let i = 0; i < Math.min(forecastDays, daily.time.length); i++) {
                    const date = new Date(daily.time[i])
                    const dateStr = date.toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        weekday: 'short'
                    })
                    resultText += `\n${dateStr}:\n`
                    resultText += `  최고: ${daily.temperature_2m_max[i]}°C / 최저: ${daily.temperature_2m_min[i]}°C\n`
                    resultText += `  강수량: ${daily.precipitation_sum[i]}mm\n`
                    resultText += `  날씨: ${getWeatherDescription(daily.weather_code[i])}\n`
                }

                return createTextResponse(resultText)
            } catch (error) {
                return createTextResponse(
                    `오류: 날씨 정보를 조회하는 중 문제가 발생했습니다. ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    )

    // 이미지 생성 도구
    server.registerTool(
        'generate-image',
        {
            description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다. (FLUX.1-schnell 모델 사용)',
            inputSchema: z.object({
                prompt: z
                    .string()
                    .describe('생성할 이미지에 대한 설명 (예: "Astronaut riding a horse", "A beautiful sunset over mountains")')
            })
        },
        async ({ prompt }) => {
            if (!hfClient) {
                return createTextResponse('오류: Hugging Face API 토큰이 설정되지 않았습니다. configSchema의 hfToken 또는 HF_TOKEN 환경변수를 설정해주세요.')
            }

            try {
                const image = (await hfClient.textToImage({
                    provider: 'auto',
                    model: 'black-forest-labs/FLUX.1-schnell',
                    inputs: prompt,
                    parameters: { num_inference_steps: 5 }
                })) as unknown as Blob

                const arrayBuffer = await image.arrayBuffer()
                const base64Data = Buffer.from(arrayBuffer).toString('base64')

                return {
                    content: [
                        {
                            type: 'image' as const,
                            data: base64Data,
                            mimeType: 'image/png',
                            annotations: {
                                audience: ['user'],
                                priority: 0.9
                            }
                        }
                    ]
                }
            } catch (error) {
                return createTextResponse(
                    `오류: 이미지 생성 중 문제가 발생했습니다. ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    )

    // 코드 리뷰 프롬프트
    server.registerPrompt(
        'code-review',
        {
            title: '코드 리뷰',
            description: '코드를 입력받아 종합적인 코드 리뷰를 위한 프롬프트를 생성합니다.',
            argsSchema: {
                code: z.string().describe('리뷰할 코드'),
                language: z
                    .string()
                    .optional()
                    .describe('프로그래밍 언어 (예: javascript, python, typescript)'),
                focus: z
                    .string()
                    .optional()
                    .describe('집중할 영역 (예: 성능, 보안, 가독성)')
            }
        },
        ({ code, language, focus }) => {
            const lang = language || '코드'
            const focusArea = focus ? `\n\n특히 다음 영역에 집중해서 리뷰해주세요: ${focus}` : ''

            const promptTemplate = `다음 ${lang} 코드를 리뷰해주세요:

\`\`\`${language || ''}
${code}
\`\`\`
${focusArea}

다음 항목들을 포함하여 종합적인 코드 리뷰를 제공해주세요:

1. **코드 품질 평가**
   - 코드의 전반적인 품질과 구조
   - 명명 규칙 및 코딩 컨벤션 준수 여부

2. **잠재적 버그 및 오류**
   - 논리적 오류나 엣지 케이스
   - 타입 관련 문제

3. **성능 고려사항**
   - 시간/공간 복잡도
   - 최적화 가능한 부분

4. **보안 취약점**
   - 입력 검증
   - 민감한 데이터 처리

5. **개선 제안**
   - 리팩토링 제안
   - 더 나은 패턴이나 라이브러리 활용

6. **베스트 프랙티스**
   - 해당 언어/프레임워크의 권장 사항
   - 테스트 가능성`

            return {
                messages: [
                    {
                        role: 'user' as const,
                        content: {
                            type: 'text' as const,
                            text: promptTemplate
                        }
                    }
                ]
            }
        }
    )

    // 서버 정보 리소스
    server.registerResource(
        'server-info',
        'server://info',
        {
            title: '서버 정보',
            description: '현재 서버 정보와 사용 가능한 도구 목록을 반환합니다.',
            mimeType: 'application/json'
        },
        async () => {
            const serverInfo = {
                server: {
                    name: SERVER_NAME,
                    version: SERVER_VERSION,
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime()
                },
                tools: [
                    { name: 'greet', description: '인사말 반환' },
                    { name: 'calculator', description: '사칙연산' },
                    { name: 'get-time', description: '타임존별 현재 시간' },
                    { name: 'geocode', description: '주소를 좌표로 변환' },
                    { name: 'get-weather', description: '날씨 정보' },
                    { name: 'generate-image', description: 'AI 이미지 생성' }
                ],
                totalTools: 6
            }

            return {
                contents: [
                    {
                        uri: 'server://info',
                        mimeType: 'application/json',
                        text: JSON.stringify(serverInfo, null, 2)
                    }
                ]
            }
        }
    )

    // Return the MCP server object (required by Smithery)
    return server.server
}
