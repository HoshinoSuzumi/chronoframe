import type { LegalKind, LegalLocale } from './legal.ts'

export const LEGAL_DEFAULTS: Record<
  LegalKind,
  Record<LegalLocale, { title: string; markdown: string }>
> = {
  terms: {
    en: {
      title: 'Terms of Service',
      markdown: `## 1. About this agreement
These terms govern your use of ChronoFrame Cloud, its hosted galleries, portal, subscriptions and related services. Please read these terms and our [Privacy Policy](/legal/privacy) before creating an account or using the service. Use the service only if you can enter into a binding agreement under applicable law. Contact us at [support@chronoframe.art](mailto:support@chronoframe.art).

## 2. Your account and content
Provide accurate account information, verify your email and protect your credentials and recovery methods. You are responsible for activity you authorize and should promptly report suspected unauthorized access. You retain ownership of your photographs and other content. You grant us only the permissions needed to store, process, resize, transmit and display that content to provide the service according to your settings.

Upload content only when you have the necessary rights and permissions, including any required permissions from people depicted. Do not upload unlawful material, infringe others’ rights, distribute malware, bypass access controls or quotas, interfere with the service, or use it for fraud or abuse. We may investigate reports and restrict unlawful or abusive activity.

## 3. Galleries, domains and storage
Publishing a gallery makes the content permitted by its visibility settings accessible to visitors. You control what you publish; a shared URL is not a guarantee of confidentiality. Access restrictions cannot prevent an authorized viewer from copying content. Keep independent backups of important originals.

Custom domains and user-provided storage are subject to your plan and to the relevant providers’ terms. You must maintain your domain and any storage credentials you supply. A change in plan, account status or domain verification may suspend custom-domain service. Changing a storage connection does not itself move existing files. Files kept in your own bucket also remain subject to your provider’s availability and charges.

## 4. Plans, payments and activation codes
Plan capabilities, quotas, prices, billing periods and any taxes are presented before purchase. Paid subscriptions may renew automatically when you authorize recurring billing. Cancellation, refunds and mandatory consumer rights follow the purchase disclosures and applicable law. Manage a paid subscription through the provided billing portal or contact support. A cancellation does not necessarily end access before the paid period finishes; the payment provider’s confirmed status determines the applicable entitlement.

Trials, promotions and activation codes may have eligibility limits, expiry dates and redemption limits. Redeeming a code does not itself authorize a card charge. When a grant expires, the workspace returns to the then-applicable default plan unless another valid entitlement applies. Exceeding a quota may prevent additional uploads or creation of resources and may suspend features unavailable on the new plan. It does not mean all existing content is immediately deleted.

## 5. Suspension, inactivity and deletion
We may suspend an account or site for security, abuse, legal requirements or violations of these terms. Where appropriate, we explain the reason and provide a support contact. Account lifecycle rules can mark unverified or inactive accounts for deletion, subject to the published rules and applicable exemptions. Notification emails state the relevant deadlines. A marked account cannot sign in; during the retention period, contact support to request restoration. After the retention period, associated data may be permanently removed, including files managed by the platform. Deleting content or an account does not cancel a separate third-party storage contract.

## 6. Availability and responsibility
We work to keep the service reliable, but outages, processing delays and third-party failures can occur. Except where applicable law requires otherwise, the service is provided as available without a promise of uninterrupted operation or permanent preservation of every file. Nothing in these terms excludes liability or rights that cannot legally be excluded. You remain responsible for lawful use, your publication choices and independent backups.

## 7. Changes and contact
We may update features, plans and these terms. This page identifies the effective date and latest revision. We will provide appropriate notice of material changes where required. If you do not accept a change, stop using the affected service and contact support about your account or subscription. Questions, complaints, rights requests and content reports can be sent to [support@chronoframe.art](mailto:support@chronoframe.art).`,
    },
    'zh-Hans': {
      title: '用户协议',
      markdown: `## 一、协议范围
本协议适用于 ChronoFrame Cloud、托管图库、门户、订阅及相关服务。创建账号或使用服务前，请阅读本协议及[隐私政策](/legal/privacy)。您应具备适用法律要求的订约资格。联系我们：[support@chronoframe.art](mailto:support@chronoframe.art)。

## 二、账号与内容
请提供真实准确的账号信息，验证邮箱，妥善保管登录凭据和恢复方式，并及时报告疑似未经授权的访问。您对自己授权的账号活动负责。照片及其他内容的权利仍归您或原权利人所有。您仅授予平台为提供服务所必需的存储、处理、缩放、传输及按您设置展示内容的权限。

请确保您有权上传和使用相关内容，并取得必要的肖像等授权。不得上传违法内容、侵犯他人权利、传播恶意程序、绕过权限或配额、干扰服务，或实施欺诈及其他滥用行为。平台可以调查投诉并限制违法或滥用活动。

## 三、图库、域名与存储
发布图库后，符合可见性设置的内容可被访客访问。请审慎选择公开内容；分享链接不等于保密措施。访问限制无法阻止已获授权的访客复制内容。重要原图请另行备份。

自定义域名和自定义存储受套餐权益及相应服务商条款约束。您应维护域名和自行提供的存储凭据。套餐、账号状态或域名验证变化可能导致自定义域名服务暂停。切换存储连接本身不会迁移已有文件；自行配置的存储桶仍受其服务商的可用性、计费和合同约束。

## 四、套餐、付款与兑换码
购买前会展示套餐权益、配额、价格、计费周期及适用税费。经您授权的付费订阅可能自动续费。取消订阅、退款及消费者法定权利以购买时的说明和适用法律为准。您可通过账单门户管理订阅，或联系客服。取消不一定意味着立即终止已付款周期内的访问权限，实际权益以支付渠道确认的状态为准。

试用、促销和兑换码可以设置资格、有效期及兑换次数限制。兑换本身不代表授权信用卡扣费。权益到期后，如无其他有效授权，工作空间会转为届时适用的默认套餐。超过配额可能阻止继续上传或创建资源，也可能暂停新套餐不包含的功能，但并不意味着所有内容立即删除。

## 五、暂停、不活跃账号与删除
出于安全、滥用、法律要求或违反本协议等原因，平台可以暂停账号或站点，并在适当情况下说明原因及联系途径。未验证邮箱或长期不活跃的账号可能按平台公布的规则被标记删除，适用豁免的账号除外；通知邮件会说明具体期限。标记删除后账号无法登录，保留期内如需恢复请联系客服。保留期结束后，关联数据及平台管理的文件可能被永久清理。删除内容或账号不会自动取消您与第三方存储商之间的合同。

## 六、服务可用性与责任
平台会努力保障服务可靠，但仍可能发生中断、处理延迟或第三方服务故障。除适用法律另有要求外，服务按实际可用状态提供，不承诺始终不中断或永久保存每一份文件。本协议不排除法律不允许排除的责任或权利。您仍需对合法使用、发布选择及独立备份负责。

## 七、变更与联系
平台可能调整功能、套餐及本协议。本页会展示生效日期和最近修订时间，并在法律要求时对重大变更提供适当通知。如不接受变更，请停止使用受影响的服务，并就账号或订阅问题联系客服。咨询、投诉、权利请求及内容举报请发送至 [support@chronoframe.art](mailto:support@chronoframe.art)。`,
    },
  },
  privacy: {
    en: {
      title: 'Privacy Policy',
      markdown: `## 1. Scope and contact
This policy explains how ChronoFrame Cloud handles information when you use its website, account portal, hosted galleries and related services. Contact [support@chronoframe.art](mailto:support@chronoframe.art) for privacy questions or requests. Owners who publish a gallery are responsible for the content and personal information they choose to disclose.

## 2. Information we process
Account information includes your email, display name, verification status, authentication records and security settings. Depending on enabled login methods, we process password hashes, passkey public credentials and protected authentication secrets. We do not need your private passkey or device biometric data.

Content information includes uploaded photographs, thumbnails, video or Live Photo components, filenames, descriptions, albums, tags and metadata such as capture time, equipment or location when present. Gallery settings determine what visitors can see. Review your photos and metadata before publishing.

Operational information can include IP addresses, user agents, sign-in times, security events, administrative actions and task or delivery records. Billing information can include plan, payment-provider customer and transaction identifiers, subscription state, billing periods and webhook records. Payment details are handled by the selected payment provider; do not send card information to support. If you connect your own storage or domain, we process the connection details and credentials needed to provide that feature.

## 3. Why we use information
We use information to authenticate users, operate galleries and storage, process media, enforce permissions and quotas, manage subscriptions, deliver verification and service messages, respond to support requests, prevent abuse and meet legal obligations. The applicable legal basis depends on your jurisdiction and the purpose, including performing the service agreement, legal obligations, legitimate security interests or consent where required.

## 4. Sharing and third-party services
Published gallery content is disclosed according to its visibility settings. Infrastructure, storage, email, domain/certificate and payment providers process information needed for their services. These may include Cloudflare and, when enabled, Creem, as well as storage providers you select. Their own terms and policies also apply to their services. We do not sell personal information. We may disclose information when legally required or necessary to protect users and the service. Any business transfer affecting information will be handled subject to applicable notice and protection requirements.

## 5. Cookies and local preferences
We use authentication cookies and local preferences necessary for sign-in, account security, language and appearance. We do not describe all cookies as advertising cookies. If optional analytics or marketing technologies are introduced, we will provide the disclosures and choices required by applicable law.

## 6. Retention and deletion
We retain information as needed to provide the service, protect accounts, resolve disputes and satisfy legal obligations. Content remains until you remove it or applicable account lifecycle rules require cleanup. Unverified or inactive accounts may receive deletion notices with specific deadlines. After an account is marked for deletion, sign-in is disabled and a retention period allows a support restoration request; permanent cleanup follows when that period ends. Quotas, exemptions and lifecycle settings can affect the applicable process. Billing, security or legally required records may have different retention requirements. Copies in backups, caches or third-party systems may take additional time to expire. Your independently operated bucket and provider contract remain under your control.

## 7. Security and international processing
We use access controls and technical safeguards, including protected authentication and storage credentials, but no system guarantees absolute security. Infrastructure and service providers may process information in locations outside your country. Where required, appropriate legal safeguards apply to such transfers. Protect your account and avoid publishing sensitive information unintentionally.

## 8. Your choices and rights
You can manage available account settings, publication visibility and content controls. Subject to applicable law, you may request access, correction, deletion, portability, restriction or objection, or withdraw consent where processing relies on it. Send requests from your account email where possible; we may verify identity to protect your information. You may also complain to the competent supervisory authority. The service is not intended for children below the age required to consent or contract under applicable law; contact us if you believe a child’s information was submitted without appropriate authorization.

## 9. Policy updates
The effective date and latest revision appear on this page. We will provide appropriate notice of material changes where required. Contact [support@chronoframe.art](mailto:support@chronoframe.art) with questions.`,
    },
    'zh-Hans': {
      title: '隐私政策',
      markdown: `## 一、范围与联系
本政策说明 ChronoFrame Cloud 在网站、账号门户、托管图库及相关服务中如何处理信息。如有隐私问题或权利请求，请联系 [support@chronoframe.art](mailto:support@chronoframe.art)。图库所有者对其选择公开的内容和个人信息负责。

## 二、处理的信息
账号信息包括邮箱、显示名称、验证状态、身份验证记录和安全设置。根据启用的登录方式，我们会处理密码哈希、通行密钥的公开凭据及受保护的身份验证秘密；我们无需获取通行密钥私钥或设备生物识别数据。

内容信息包括照片、缩略图、视频或实况照片组成部分、文件名、描述、相簿、标签，以及文件中包含的拍摄时间、设备、位置等元数据。图库设置会影响访客可见的内容。发布前请检查照片及元数据，避免无意公开敏感信息。

运行信息可能包括 IP 地址、浏览器信息、登录时间、安全事件、管理员操作、任务和邮件投递记录。计费信息可能包括套餐、支付渠道客户和交易标识、订阅状态、计费周期及回调记录。支付详情由所选支付服务商处理，请勿向客服发送银行卡信息。连接自定义存储或域名时，我们会处理提供该功能所需的连接信息和凭据。

## 三、处理目的
信息用于身份验证、图库与存储运行、媒体处理、权限与配额执行、订阅管理、验证码及服务通知、客服响应、滥用防范和履行法律义务。具体法律依据因所在地和处理目的而异，可能包括履行服务协议、法定义务、合理安全利益，或法律要求的同意。

## 四、共享与第三方服务
图库内容按您设置的可见性向访客展示。基础设施、存储、邮件、域名和证书、支付等服务商会处理其提供服务所必需的信息，可能包括 Cloudflare、启用后的 Creem，以及您选择的存储服务商；其服务亦适用各自的条款与隐私政策。我们不出售个人信息。在法律要求或保护用户与平台安全所必需的情况下，我们可能依法披露信息。涉及业务转移时，会遵守适用的通知及信息保护要求。

## 五、Cookie 与本地偏好
平台使用登录、安全、语言及外观等必要的 Cookie 和本地偏好设置。这些功能不等同于广告追踪。未来如引入可选分析或营销技术，我们会提供适用法律要求的说明与选择。

## 六、保存与删除
我们按提供服务、保护账号、解决争议及履行法律义务所需的期限保存信息。内容可因您的删除操作或适用的账号生命周期规则被清理。未验证或不活跃账号可能收到包含具体日期的删除通知。账号被标记删除后将无法登录，保留期内可联系客服申请恢复，保留期结束后进行永久清理；配额、豁免和生命周期设置可能影响具体流程。计费、安全或依法必须留存的记录可能适用不同期限。备份、缓存及第三方系统中的副本可能需要额外时间到期。您自行运营的存储桶和相关服务合同仍由您控制。

## 七、安全与跨境处理
平台使用访问控制等技术措施保护信息，包括保护身份验证和存储凭据，但无法保证任何系统绝对安全。基础设施与服务商可能在您所在国家或地区以外处理信息；法律要求时，我们会采取相应的跨境传输保障措施。请保护账号，并审慎选择公开内容。

## 八、您的选择与权利
您可以使用已有的账号设置、发布可见性及内容管理功能。根据适用法律，您可能有权申请访问、更正、删除、可携带、限制处理、反对处理，或在依赖同意时撤回同意。建议通过账号邮箱发送请求；为保护信息，我们可能核验您的身份。您亦可向有权监管机构投诉。平台不面向未达到适用法律所要求同意或订约年龄的儿童；如认为儿童信息在缺乏适当授权的情况下被提交，请联系我们。

## 九、政策更新
本页展示生效日期和最近修订时间。法律要求时，我们会就重大变更提供适当通知。如有疑问，请联系 [support@chronoframe.art](mailto:support@chronoframe.art)。`,
    },
  },
}
