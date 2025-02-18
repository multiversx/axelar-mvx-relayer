export class SlackMessage {
  title: string = '';
  text: string = '';
  attachments: any[] = [];

  static buildWarnMessage(title: string, message: string) {
    const slackMessage = new SlackMessage();
    slackMessage.title = title;
    slackMessage.text = title;
    slackMessage.attachments = [
      {
        color: '#ECB22E',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message,
            },
          },
        ],
      },
    ];
    return slackMessage;
  }

  static buildErrorMessage(title: string, message: string) {
    const slackMessage = new SlackMessage();
    slackMessage.title = title;
    slackMessage.text = title;
    slackMessage.attachments = [
      {
        color: '#E01E5A',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message,
            },
          },
        ],
      },
    ];
    return slackMessage;
  }
}
