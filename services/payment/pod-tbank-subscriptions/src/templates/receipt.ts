//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Receipt (successful-payment) email copy — data only, no markup. {param} placeholders are filled
// by the renderer in notifications.ts. Field labels are shared across purchase/renewal.
export default {
  ru: {
    subject: 'Чек об оплате — {plan} от {paidAtDate}',
    intro: {
      purchase: 'Оплата по подписке «{plan}» прошла успешно.',
      renewal: 'Подписка «{plan}» успешно продлена.'
    },
    labels: {
      customer: 'Плательщик',
      plan: 'Тариф',
      amount: {
        purchase: 'Сумма',
        renewal: 'Сумма списания'
      },
      paidAt: 'Дата и время оплаты',
      txId: 'ID транзакции',
      paymentMethod: 'Способ оплаты',
      period: 'Период подписки'
    },
    manageLink: 'Управление подпиской',
    support: 'Контакты поддержки'
  },
  en: {
    subject: 'Payment receipt — {plan} from {paidAtDate}',
    intro: {
      purchase: 'Your payment for the "{plan}" subscription was successful.',
      renewal: 'Your "{plan}" subscription was renewed successfully.'
    },
    labels: {
      customer: 'Customer',
      plan: 'Plan',
      amount: {
        purchase: 'Amount',
        renewal: 'Amount charged'
      },
      paidAt: 'Payment date and time',
      txId: 'Transaction ID',
      paymentMethod: 'Payment method',
      period: 'Subscription period'
    },
    manageLink: 'Manage your subscription',
    support: 'Support contacts'
  }
}
