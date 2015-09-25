class ReporterMailer < ActionMailer::Base
  default from: "cartodb.com <support@cartodb.com>"
  layout 'mail'

  def trending_maps_report(mail_to, trending_visualizations)
    @subject = "Daily report for trending maps"
    @trending_visualizations = trending_visualizations

    mail to: mail_to, subject: @subject
  end
end
