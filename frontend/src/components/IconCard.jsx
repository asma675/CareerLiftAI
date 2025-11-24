import "./IconCard.scss";

const IconCard = ({ icon: Icon, title, children, className = "" }) => (
  <div className={`icon-card ${className}`}>
    <div className="icon-card__header">
      <Icon className="icon-card__icon drop-shadow-glow" />
      <h3 className="icon-card__title">{title}</h3>
    </div>
    {children}
  </div>
);

export default IconCard;
